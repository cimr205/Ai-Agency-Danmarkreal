import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Json, Enums } from '@/integrations/supabase/types';

export type Customer = Tables<'customers'>;
export type Company = Tables<'companies'>;

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
        .insert({ ...input, company_id: companyId, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
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
      // Delete linked payments first (FK)
      await supabase.from('payments').delete().eq('invoice_id', id);
      const { error } = await supabase.from('invoices').delete().eq('id', id);
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
      const { session, companyId } = await getProfileWithCompany();
      const { data, error } = await supabase
        .from('payments')
        .insert({
          invoice_id: input.invoice_id,
          amount: input.amount,
          payment_method: input.payment_method || null,
          status: (input.status as Enums<'payment_status'>) || 'completed',
          paid_at: input.status === 'completed' || !input.status ? new Date().toISOString() : null,
          company_id: companyId,
          created_by: session.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
