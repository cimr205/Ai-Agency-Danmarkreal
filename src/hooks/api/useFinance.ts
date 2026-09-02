import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Json, Enums, Database } from '@/integrations/supabase/types';

export type Customer = Tables<'customers'>;
// useCompanyInfo() always goes through the get_company_for_user() RPC (a
// deliberately narrower "safe" column set than the full companies table),
// so Company must match that RPC's actual return shape, not Tables<'companies'>.
export type Company = Database['public']['Functions']['get_company_for_user']['Returns'][number];

export interface InvoiceWithCustomer extends Tables<'invoices'> {
  customers: Pick<Customer, 'name' | 'email' | 'country' | 'customer_type' | 'vat_number'> | null;
}

export interface PaymentWithInvoice extends Tables<'payments'> {
  invoices: Pick<Tables<'invoices'>, 'invoice_number' | 'amount' | 'status'> | null;
}

// Helper to get profile
async function getProfileWithCompany() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile?.company_id) throw new Error('No company');
  return { session, companyId: profile.company_id };
}

// Customers
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('record_type', 'customer')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email: string; phone?: string; address?: string; country?: string; customer_type?: string; vat_number?: string }) => {
      const { session, companyId } = await getProfileWithCompany();
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...input, company_id: companyId, created_by: session.user.id, record_type: 'customer' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; email?: string; phone?: string; address?: string; vat_number?: string }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['client-graph'] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// Company info for invoice sender
export function useCompanyInfo() {
  return useQuery({
    queryKey: ['company-info'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) return null;
      // Use safe function to avoid exposing sensitive fields
      const { data, error } = await supabase
        .rpc('get_company_for_user', { _company_id: profile.company_id });
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

// Generate invoice number
export function useGenerateInvoiceNumber() {
  return useMutation({
    mutationFn: async () => {
      const { companyId } = await getProfileWithCompany();
      const { data, error } = await supabase.rpc('generate_invoice_number', { _company_id: companyId });
      if (error) throw error;
      return data as string;
    },
  });
}

// Invoices
export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(name, email, country, customer_type, vat_number)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Supabase's TS inference doesn't resolve nested-select shapes from the
      // select string, so the join is cast once here to a hand-written type
      // instead of leaking `any` through every call site.
      return data as unknown as InvoiceWithCustomer[];
    },
  });
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface CreateInvoiceInput {
  customer_id: string;
  lines: InvoiceLine[];
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  amount: number;
  customer_country: string;
  customer_type: string;
  vat_note?: string;
  due_date?: string;
  notes?: string;
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { session, companyId } = await getProfileWithCompany();
      // Generate invoice number
      const { data: invoiceNumber, error: numErr } = await supabase.rpc('generate_invoice_number', { _company_id: companyId });
      if (numErr) throw numErr;

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          ...input,
          invoice_number: invoiceNumber as string,
          lines: input.lines as unknown as Json,
          company_id: companyId,
          created_by: session.user.id,
        })
        .select('*, customers(name)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_draft_invoice', { p_invoice_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === 'paid') {
        const [{ data: invoice, error: invoiceError }, { data: payments, error: paymentsError }] = await Promise.all([
          supabase.from('invoices').select('amount').eq('id', id).single(),
          supabase.from('payments').select('amount').eq('invoice_id', id).eq('status', 'completed'),
        ]);
        if (invoiceError || paymentsError) throw invoiceError || paymentsError;
        const alreadyPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
        const remaining = Number(invoice.amount) - alreadyPaid;
        if (remaining <= 0) return invoice;
        const { data, error } = await supabase.rpc('register_invoice_payment', {
          p_invoice_id: id, p_amount: remaining, p_payment_method: 'manual',
          p_idempotency_key: `manual-paid:${id}`,
        });
        if (error) throw error;
        return data;
      }
      if (status === 'cancelled') {
        const { data, error } = await supabase.rpc('void_invoice', {
          p_invoice_id: id, p_reason: 'Cancelled from invoice interface',
        });
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: status as Enums<'invoice_status'> })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

// Payments
export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, invoices(invoice_number, amount, status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentWithInvoice[];
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { invoice_id: string; amount: number; payment_method?: string; status?: string }) => {
      const { data, error } = await supabase.rpc('register_invoice_payment', {
        p_invoice_id: input.invoice_id,
        p_amount: input.amount,
        p_payment_method: input.payment_method || 'manual',
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
