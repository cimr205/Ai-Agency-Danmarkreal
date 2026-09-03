import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInvoices, useCreateInvoice, useUpdateInvoiceStatus, useDeleteInvoice, useCustomers, useCreateCustomer, useCompanyInfo, type InvoiceLine, type InvoiceWithCustomer, type Company } from '@/hooks/api/useFinance';
import { useGmailAccount, useConnectGmail, useSendEmail } from '@/hooks/api/useEmail';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, FileText, DollarSign, Printer, Trash2, Send, Mail, AlertCircle, ExternalLink, Upload, Download, UserPlus, Building2, User, Palette, Users, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLeads } from '@/hooks/api/useLeads';
import { toast } from 'sonner';
import { useI18n, type Locale } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';
import { generateInvoicePdf, downloadPdf, getTemplateOptions, type InvoiceTemplate, type InvoicePdfData } from '@/lib/invoicePdf';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/lib/errors';

type Lead = Tables<'leads'>;

const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

interface EditingInvoice extends InvoiceWithCustomer {
  editLines: InvoiceLine[];
  editDueDate: string;
  editNotes: string;
}

function getVatInfo(country: string, customerType: string): { rate: number; note: string } {
  if (country === 'DK') return { rate: 25, note: '' };
  if (EU_COUNTRIES.includes(country) && customerType === 'business') return { rate: 0, note: 'Reverse charge – EU B2B' };
  if (EU_COUNTRIES.includes(country) && customerType === 'private') return { rate: 25, note: 'EU private – Danish VAT' };
  return { rate: 0, note: 'Non-EU – VAT exempt' };
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  paid: 'bg-accent/10 text-accent',
  overdue: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

function useFormatCurrency() {
  const { format } = useCurrency();
  return useCallback((amount: number) => format(amount), [format]);
}

function buildPdfData(invoice: InvoiceWithCustomer, company: Company | null | undefined, formatCurrency: (n: number) => string, locale: string, statusLabels: Record<string, string>): InvoicePdfData {
  return {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at,
    dueDate: invoice.due_date,
    status: statusLabels[invoice.status] || invoice.status,
    companyName: company?.name || '',
    companyCvr: company?.cvr || '',
    companyAddress: company?.address || '',
    companyEmail: company?.email || '',
    companyPhone: company?.phone || '',
    companyLogoUrl: company?.logo_url || '',
    bankName: company?.bank_name || '',
    bankRegNumber: company?.bank_reg_number || '',
    bankAccountNumber: company?.bank_account_number || '',
    iban: company?.iban || '',
    swift: company?.swift || '',
    paymentReferenceNote: company?.payment_reference_note || '',
    customerName: invoice.customers?.name || '',
    customerEmail: invoice.customers?.email || '',
    customerCountry: invoice.customers?.country || '',
    customerVat: invoice.customers?.vat_number || '',
    lines: (invoice.lines as unknown as InvoiceLine[]) || [],
    subtotal: Number(invoice.subtotal || 0),
    vatRate: invoice.vat_rate || 0,
    vatAmount: Number(invoice.vat_amount || 0),
    total: Number(invoice.amount),
    vatNote: invoice.vat_note || '',
    notes: invoice.notes || '',
    formatCurrency,
    locale,
  };
}

export default function InvoicesPage() {
  const { t, locale } = useI18n();
  const formatCurrency = useFormatCurrency();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCustomer | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<EditingInvoice | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: '', quantity: 1, unit_price: 0, total: 0 }]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [priceMode, setPriceMode] = useState<'excl' | 'incl'>('excl');
  const [createStep, setCreateStep] = useState<'details' | 'lines'>('details');
  const [pdfTemplate, setPdfTemplate] = useState<InvoiceTemplate>('modern');

  // Inline customer creation
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', email: '', country: 'DK', customer_type: 'business', vat_number: '', phone: '', address: '' });
  const [searchParams, setSearchParams] = useSearchParams();

  // Lead search (to invoice from a lead)
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');

  // Customer search (to invoice an existing client directly)
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const { data: leadsData } = useLeads({ search: leadSearch, page: 0 });
  const leads = leadsData?.data ?? [];

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Email send state
  const [emailDialogInvoice, setEmailDialogInvoice] = useState<InvoiceWithCustomer | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingWithPdf, setSendingWithPdf] = useState(false);

  const { data: gmailAccount, isLoading: gmailLoading } = useGmailAccount();
  const sendEmail = useSendEmail();

  const statusLabels: Record<string, string> = {
    draft: t('pages.invoices.statusDraft'), sent: t('pages.invoices.statusSent'),
    paid: t('pages.invoices.statusPaid'), overdue: t('pages.invoices.statusOverdue'), cancelled: t('pages.invoices.statusCancelled'),
  };

  const { data, isLoading, error } = useInvoices();
  const { data: customers, refetch: refetchCustomers } = useCustomers();
  const { data: company, refetch: refetchCompany } = useCompanyInfo();
  const createInvoice = useCreateInvoice();
  const createCustomer = useCreateCustomer();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  const templateOptions = useMemo(() => getTemplateOptions(locale), [locale]);

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${company.id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
      await supabase.from('companies').update({ logo_url: urlData.publicUrl }).eq('id', company.id);
      refetchCompany();
      toast.success(t('pages.invoices.logoUploaded'));
    } catch {
      toast.error(t('pages.invoices.logoUploadError'));
    } finally {
      setUploadingLogo(false);
    }
  };

  // Inline customer creation
  const handleCreateCustomerInline = async () => {
    if (!newCust.name || !newCust.email) return;
    try {
      const created = await createCustomer.mutateAsync(newCust);
      toast.success(t('pages.invoices.customerCreated'));
      setSelectedCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCust({ name: '', email: '', country: 'DK', customer_type: 'business', vat_number: '', phone: '', address: '' });
      refetchCustomers();
    } catch {
      toast.error(t('pages.invoices.created_error'));
    }
  };

  // PDF generation
  const handleDownloadPdf = async (invoice: InvoiceWithCustomer) => {
    try {
      const pdfData = buildPdfData(invoice, company, formatCurrency, locale, statusLabels);
      const blob = await generateInvoicePdf(pdfData, pdfTemplate);
      downloadPdf(blob, `${invoice.invoice_number}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error(t('common.error'));
    }
  };

  const openEmailDialog = (invoice: InvoiceWithCustomer) => {
    const customerEmail = invoice.customers?.email || '';
    if (!customerEmail) { toast.error(t('pages.invoices.noCustomerEmail')); return; }
    setEmailTo(customerEmail);
    const companyName = company?.name || 'Company';
    setEmailSubject(t('pages.invoices.emailSubjectDefault').replace('{{invoiceNo}}', invoice.invoice_number).replace('{{company}}', companyName));
    setEmailMessage(t('pages.invoices.emailMessageDefault').replace('{{invoiceNo}}', invoice.invoice_number).replace('{{amount}}', formatCurrency(Number(invoice.amount))).replace('{{dueDate}}', invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '–').replace('{{company}}', companyName));
    setEmailDialogInvoice(invoice);
  };

  const handleSendEmail = async () => {
    if (!emailTo || !emailSubject || !emailMessage || !emailDialogInvoice) return;
    setSendingWithPdf(true);
    try {
      // Generate PDF and upload to storage for download link
      const pdfData = buildPdfData(emailDialogInvoice, company, formatCurrency, locale, statusLabels);
      const blob = await generateInvoicePdf(pdfData, pdfTemplate);

      // Upload to storage
      const fileName = `invoices/${emailDialogInvoice.id}/${emailDialogInvoice.invoice_number}.pdf`;
      const { error: uploadErr } = await supabase.storage.from('company-logos').upload(fileName, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });

      let pdfUrl = '';
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(fileName);
        pdfUrl = urlData.publicUrl;
      }

      // Build HTML email with PDF link
      const htmlBody = emailMessage.replace(/\n/g, '<br/>') +
        (pdfUrl ? `<br/><br/><a href="${pdfUrl}" style="display:inline-block;padding:12px 24px;background:#1e40af;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">📄 ${locale === 'da' ? 'Download faktura PDF' : 'Download Invoice PDF'}</a>` : '');

      await sendEmail.mutateAsync({ to: emailTo, subject: emailSubject, message: htmlBody });
      if (emailDialogInvoice?.status === 'draft') await updateStatus.mutateAsync({ id: emailDialogInvoice.id, status: 'sent' });
      toast.success(t('pages.invoices.emailSent'));
      setEmailDialogInvoice(null);
    } catch {
      toast.error(t('pages.invoices.emailSentError'));
    } finally {
      setSendingWithPdf(false);
    }
  };

  const invoices = data ?? [];
  const searchFiltered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredInvoices = statusFilter === 'all' ? searchFiltered : searchFiltered.filter(inv => inv.status === statusFilter);

  const selectedCustomer = useMemo(() => customers?.find(c => c.id === selectedCustomerId), [customers, selectedCustomerId]);
  const vatInfo = useMemo(() => {
    if (!selectedCustomer) return { rate: 25, note: '' };
    return getVatInfo(selectedCustomer.country || 'DK', selectedCustomer.customer_type || 'business');
  }, [selectedCustomer]);

  const lineSubtotal = lines.reduce((s, l) => s + l.total, 0);
  const subtotal = priceMode === 'incl' ? lineSubtotal / (1 + vatInfo.rate / 100) : lineSubtotal;
  const vatAmount = subtotal * (vatInfo.rate / 100);
  const totalAmount = subtotal + vatAmount;

  const updateLine = (index: number, field: keyof InvoiceLine, value: string | number) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unit_price') updated[index].total = Number(updated[index].quantity) * Number(updated[index].unit_price);
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { description: '', quantity: 1, unit_price: 0, total: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const resetForm = () => { setSelectedCustomerId(''); setLines([{ description: '', quantity: 1, unit_price: 0, total: 0 }]); setDueDate(''); setNotes(''); setPriceMode('excl'); setCreateStep('details'); setShowNewCustomer(false); setLeadSearch(''); };

  // Create invoice directly from a lead — auto-creates a customer if needed
  const handleSelectLead = async (lead: Lead) => {
    setLeadPickerOpen(false);
    if (!lead?.email || !lead?.name) {
      toast.error(t('pages.invoices.selectError'));
      return;
    }
    // Try match existing customer by email
    const existing = customers?.find(c => c.email?.toLowerCase() === lead.email.toLowerCase());
    if (existing) {
      setSelectedCustomerId(existing.id);
      toast.success(t('pages.invoices.customerCreated'));
      return;
    }
    // Pre-fill inline form with lead data (address/city are optional)
    setShowNewCustomer(true);
    setNewCust({
      name: lead.company_name || lead.name,
      email: lead.email,
      country: 'DK',
      customer_type: lead.company_name ? 'business' : 'private',
      vat_number: '',
      phone: lead.phone || '',
      address: [lead.address, lead.city].filter(Boolean).join(', '),
    });
  };

  const handleCreate = async () => {
    if (!selectedCustomerId || lines.length === 0 || lines.some(l => !l.description || l.total <= 0)) { toast.error(t('pages.invoices.selectError')); return; }
    try {
      await createInvoice.mutateAsync({ customer_id: selectedCustomerId, lines, subtotal, vat_rate: vatInfo.rate, vat_amount: vatAmount, amount: totalAmount, customer_country: selectedCustomer?.country || 'DK', customer_type: selectedCustomer?.customer_type || 'business', vat_note: vatInfo.note || undefined, due_date: dueDate || undefined, notes: notes || undefined });
      toast.success(t('pages.invoices.created_success'));
      resetForm(); setIsCreateOpen(false);
    } catch { toast.error(t('pages.invoices.created_error')); }
  };

  const invoiceStats = useMemo(() => ({
    total: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
    totalAmount: invoices.reduce((s, i) => s + Number(i.amount), 0),
    overdue: invoices.filter(i => i.status === 'overdue').length,
  }), [invoices]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.invoices.title')}</h1>
          <p className="text-muted-foreground">{t('pages.invoices.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Template selector with visual color preview */}
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={pdfTemplate} onValueChange={(v) => setPdfTemplate(v as InvoiceTemplate)}>
              <SelectTrigger className="w-40 sm:w-52 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateOptions.map(o => {
                  const swatch: Record<string, string> = {
                    modern: 'rgb(30,64,175)', classic: 'rgb(30,30,46)', minimal: 'rgb(0,0,0)', bold: 'rgb(5,150,105)', elegant: 'rgb(109,40,217)',
                  };
                  return (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full ring-1 ring-border" style={{ background: swatch[o.value] }} />
                        {o.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('pages.invoices.newInvoice')}</Button></DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('pages.invoices.createTitle')}</DialogTitle>
                <DialogDescription>{t('pages.invoices.createSubtitle')}</DialogDescription>
              </DialogHeader>

              <Tabs value={createStep} onValueChange={(v) => setCreateStep(v as 'details' | 'lines')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {t('pages.invoices.sender')} & {t('pages.invoices.receiver')}
                  </TabsTrigger>
                  <TabsTrigger value="lines" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t('pages.invoices.invoiceLines')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6 mt-4">
                  {/* Visual template gallery */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Palette className="h-4 w-4" />
                      {locale === 'da' ? 'Vælg fakturadesign' : 'Choose invoice design'}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {templateOptions.map(o => {
                        const colors: Record<string, { primary: string; bg: string; accent: string }> = {
                          modern: { primary: 'rgb(30,64,175)', bg: 'rgb(248,250,252)', accent: 'rgb(59,130,246)' },
                          classic: { primary: 'rgb(30,30,46)', bg: 'rgb(255,255,255)', accent: 'rgb(100,116,139)' },
                          minimal: { primary: 'rgb(0,0,0)', bg: 'rgb(255,255,255)', accent: 'rgb(107,114,128)' },
                          bold: { primary: 'rgb(5,150,105)', bg: 'rgb(240,253,244)', accent: 'rgb(16,185,129)' },
                          elegant: { primary: 'rgb(109,40,217)', bg: 'rgb(250,245,255)', accent: 'rgb(139,92,246)' },
                        };
                        const c = colors[o.value];
                        const isSelected = pdfTemplate === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => setPdfTemplate(o.value)}
                            className={`relative rounded-lg border-2 p-2 text-left transition-all hover:scale-[1.02] ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
                            style={{ background: c.bg }}
                          >
                            {isSelected && (
                              <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                            <div className="h-1.5 rounded-sm mb-1.5" style={{ background: c.primary }} />
                            <div className="space-y-0.5">
                              <div className="h-1 rounded-sm w-3/4" style={{ background: c.accent, opacity: 0.6 }} />
                              <div className="h-1 rounded-sm w-1/2" style={{ background: c.accent, opacity: 0.4 }} />
                              <div className="h-1 rounded-sm w-2/3" style={{ background: c.accent, opacity: 0.4 }} />
                            </div>
                            <div className="h-1 rounded-sm mt-2" style={{ background: c.primary }} />
                            <p className="text-[10px] font-medium mt-1.5 truncate" style={{ color: c.primary }}>{o.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sender section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Building2 className="h-4 w-4" />
                      {t('pages.invoices.sender')}
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card/50 space-y-3">
                      <div className="flex items-center gap-4">
                        {company?.logo_url ? (
                          <div className="relative group">
                            <img src={company.logo_url} alt="Logo" className="h-16 w-auto max-w-[160px] object-contain rounded-lg border border-border p-1" />
                            <Button variant="ghost" size="sm" className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-background/80 text-xs" onClick={() => logoInputRef.current?.click()}>
                              {t('pages.invoices.changeLogo')}
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                            <Upload className="h-4 w-4 mr-2" />
                            {uploadingLogo ? '...' : t('pages.invoices.uploadLogo')}
                          </Button>
                        )}
                        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        <div>
                          <p className="font-semibold text-foreground">{company?.name || '–'}</p>
                          <p className="text-sm text-muted-foreground">CVR: {company?.cvr || '–'}</p>
                          <p className="text-sm text-muted-foreground">{company?.address || '–'}</p>
                          {company?.email && <p className="text-sm text-muted-foreground">{company.email}</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Receiver section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <User className="h-4 w-4" />
                      {t('pages.invoices.receiver')}
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card/50 space-y-4">
                      {!showNewCustomer ? (
                        <>
                          {/* Lead picker — search and pick a lead to invoice */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />{locale === 'da' ? 'Find lead' : 'Find lead'}</Label>
                            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                                  <span className="flex items-center gap-2 text-muted-foreground">
                                    <Search className="h-3.5 w-3.5" />
                                    {locale === 'da' ? 'Søg efter et lead at fakturere…' : 'Search a lead to invoice…'}
                                  </span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command shouldFilter={false}>
                                  <CommandInput placeholder={locale === 'da' ? 'Søg navn, email, firma…' : 'Search name, email, company…'} value={leadSearch} onValueChange={setLeadSearch} />
                                  <CommandList>
                                    <CommandEmpty>{locale === 'da' ? 'Ingen leads fundet' : 'No leads found'}</CommandEmpty>
                                    <CommandGroup>
                                      {leads.slice(0, 25).map((lead: Lead) => (
                                        <CommandItem key={lead.id} value={lead.id} onSelect={() => handleSelectLead(lead)} className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{lead.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{lead.email}{lead.company_name ? ` · ${lead.company_name}` : ''}</div>
                                          </div>
                                          <Plus className="h-4 w-4 text-primary shrink-0" />
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground">{locale === 'da' ? 'Vælger du et lead, oprettes en kunde automatisk.' : 'Picking a lead auto-creates a customer.'}</p>
                          </div>

                          <Separator />

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>{t('pages.invoices.customer')} *</Label>
                              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                                    <span className="flex items-center gap-2 text-muted-foreground truncate">
                                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">
                                        {selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.country ? ` (${selectedCustomer.country})` : ''}` : t('pages.invoices.selectCustomer')}
                                      </span>
                                    </span>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                  <Command>
                                    <CommandInput placeholder={locale === 'da' ? 'Søg klient…' : 'Search client…'} value={customerSearch} onValueChange={setCustomerSearch} />
                                    <CommandList>
                                      <CommandEmpty>{locale === 'da' ? 'Ingen klienter fundet' : 'No clients found'}</CommandEmpty>
                                      <CommandGroup>
                                        {(customers ?? []).map(c => (
                                          <CommandItem
                                            key={c.id}
                                            value={`${c.name} ${c.email ?? ''}`}
                                            onSelect={() => { setSelectedCustomerId(c.id); setCustomerPickerOpen(false); setCustomerSearch(''); }}
                                            className="flex items-center justify-between gap-3"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium truncate">{c.name} {c.country ? `(${c.country})` : ''}</div>
                                              {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
                                            </div>
                                            {selectedCustomerId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="space-y-2">
                              <Label>{t('pages.invoices.dueDate')}</Label>
                              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-primary" onClick={() => setShowNewCustomer(true)}>
                            <UserPlus className="h-4 w-4 mr-2" />{t('pages.invoices.createCustomerInline')}
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs">{t('pages.invoices.newCustomerName')} *</Label>
                              <Input value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('pages.invoices.newCustomerEmail')} *</Label>
                              <Input type="email" value={newCust.email} onChange={e => setNewCust({ ...newCust, email: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('pages.invoices.newCustomerCountry')}</Label>
                              <Input value={newCust.country} onChange={e => setNewCust({ ...newCust, country: e.target.value })} placeholder="DK" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('pages.invoices.newCustomerType')}</Label>
                              <Select value={newCust.customer_type} onValueChange={v => setNewCust({ ...newCust, customer_type: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="business">{t('pages.invoices.business')}</SelectItem>
                                  <SelectItem value="private">{t('pages.invoices.private')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{locale === 'da' ? 'Telefon' : 'Phone'} <span className="text-muted-foreground">({locale === 'da' ? 'valgfri' : 'optional'})</span></Label>
                              <Input value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('pages.invoices.newCustomerVat')} <span className="text-muted-foreground">({locale === 'da' ? 'valgfri' : 'optional'})</span></Label>
                              <Input value={newCust.vat_number} onChange={e => setNewCust({ ...newCust, vat_number: e.target.value })} />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label className="text-xs">{locale === 'da' ? 'Adresse' : 'Address'} <span className="text-muted-foreground">({locale === 'da' ? 'valgfri' : 'optional'})</span></Label>
                              <Input value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} placeholder={locale === 'da' ? 'Hovedgaden 1, 1000 København' : 'Main St 1, 1000 Copenhagen'} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {locale === 'da'
                              ? 'Bekræft kunden nedenfor, før du kan fortsætte til fakturalinjer.'
                              : 'Confirm the customer below before you can continue to invoice lines.'}
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleCreateCustomerInline} disabled={createCustomer.isPending || !newCust.name || !newCust.email}>
                              {createCustomer.isPending ? t('pages.invoices.creatingCustomer') : t('pages.invoices.customerCreated').split(' ')[0]}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setShowNewCustomer(false)}>{t('common.cancel')}</Button>
                          </div>
                        </div>
                      )}

                      {selectedCustomer && (
                        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm">
                          <p className="font-medium">{selectedCustomer.name}</p>
                          <p className="text-muted-foreground">{selectedCustomer.email}</p>
                          <p className="text-muted-foreground">{t('pages.invoices.country')}: {selectedCustomer.country || 'DK'} · {t('pages.invoices.type')}: {selectedCustomer.customer_type === 'business' ? t('pages.invoices.business') : t('pages.invoices.private')}</p>
                          <p className="font-medium mt-1">{t('pages.invoices.vat')}: {vatInfo.rate}% {vatInfo.note && `– ${vatInfo.note}`}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => {
                      if (!selectedCustomerId) { toast.error(t('pages.invoices.selectError')); return; }
                      setCreateStep('lines');
                    }}>
                      {t('auth.nextStep')} →
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="lines" className="space-y-6 mt-4">
                  <div className="space-y-2">
                    <Label>{t('pages.invoices.priceType')}</Label>
                    <Select value={priceMode} onValueChange={(v) => setPriceMode(v as 'excl' | 'incl')}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excl">{t('pages.invoices.priceExcl')}</SelectItem>
                        <SelectItem value="incl">{t('pages.invoices.priceIncl')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>{t('pages.invoices.invoiceLines')}</Label>
                    {lines.map((line, i) => (
                      <div key={i} className="grid gap-2 grid-cols-[1fr_80px_100px_100px_32px] items-end">
                        <div>{i === 0 && <Label className="text-xs text-muted-foreground">{t('pages.invoices.description')}</Label>}<Input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder={t('pages.invoices.productPlaceholder')} /></div>
                        <div>{i === 0 && <Label className="text-xs text-muted-foreground">{t('pages.invoices.quantity')}</Label>}<Input type="number" min={1} value={line.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} /></div>
                        <div>{i === 0 && <Label className="text-xs text-muted-foreground">{t('pages.invoices.unitPrice')}</Label>}<Input type="number" min={0} value={line.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} /></div>
                        <div>{i === 0 && <Label className="text-xs text-muted-foreground">{t('pages.invoices.lineTotal')}</Label>}<Input value={formatCurrency(line.total)} readOnly className="bg-muted/50" /></div>
                        <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length <= 1} className="h-10 w-10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />{t('pages.invoices.addLine')}</Button>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-sm max-w-xs ml-auto">
                    {priceMode === 'incl' && <div className="flex justify-between text-muted-foreground"><span>{t('pages.invoices.lineSubtotalIncl')}</span><span>{formatCurrency(lineSubtotal)}</span></div>}
                    <div className="flex justify-between"><span>{t('pages.invoices.subtotal')}</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between"><span>{t('pages.invoices.vatAmount')} ({vatInfo.rate}%)</span><span className="font-medium">{formatCurrency(vatAmount)}</span></div>
                    <Separator />
                    <div className="flex justify-between text-base font-bold text-primary"><span>{t('pages.invoices.totalInclVat')}</span><span>{formatCurrency(totalAmount)}</span></div>
                  </div>

                  <div className="space-y-2"><Label>{t('pages.invoices.notes')}</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('pages.invoices.notesPlaceholder')} rows={2} /></div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCreateStep('details')}>← {t('auth.back')}</Button>
                    <Button onClick={handleCreate} disabled={createInvoice.isPending} className="flex-1">{createInvoice.isPending ? t('pages.invoices.creating') : t('pages.invoices.createCta')}</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('pages.invoices.totalInvoices')}</p><p className="text-2xl font-bold">{invoiceStats.total}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center"><DollarSign className="h-6 w-6 text-accent" /></div><div><p className="text-sm text-muted-foreground">{t('pages.invoices.paid')}</p><p className="text-2xl font-bold text-accent">{formatCurrency(invoiceStats.paid)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('pages.invoices.totalAmount')}</p><p className="text-2xl font-bold">{formatCurrency(invoiceStats.totalAmount)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center"><FileText className="h-6 w-6 text-destructive" /></div><div><p className="text-sm text-muted-foreground">{t('pages.invoices.overdue')}</p><p className="text-2xl font-bold text-destructive">{invoiceStats.overdue}</p></div></div></CardContent></Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('pages.invoices.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
            <TabsTrigger value="draft">{t('pages.invoices.statusDraft')}</TabsTrigger>
            <TabsTrigger value="sent">{t('pages.invoices.statusSent')}</TabsTrigger>
            <TabsTrigger value="paid">{t('pages.invoices.statusPaid')}</TabsTrigger>
            <TabsTrigger value="overdue">{t('pages.invoices.statusOverdue')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('pages.invoices.invoiceNo')}</TableHead>
              <TableHead>{t('pages.invoices.customer')}</TableHead>
              <TableHead className="text-right">{t('pages.invoices.subtotal')}</TableHead>
              <TableHead className="text-right">{t('pages.invoices.vatAmount')}</TableHead>
              <TableHead className="text-right">{t('pages.invoices.lineTotal')}</TableHead>
              <TableHead>{t('pages.invoices.status')}</TableHead>
              <TableHead>{t('pages.invoices.issued')}</TableHead>
              <TableHead className="text-right">{t('pages.invoices.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
            )) : filteredInvoices.length === 0 ? (
              <TableRow><TableCell colSpan={8}>
                <EmptyState
                  bare
                  icon={FileText}
                  title={error ? t('pages.invoices.fetchError') : t('pages.invoices.empty')}
                  action={!error ? { label: t('pages.invoices.newInvoice'), onClick: () => setIsCreateOpen(true), icon: Plus } : undefined}
                />
              </TableCell></TableRow>
            ) : filteredInvoices.map(invoice => (
              <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedInvoice(invoice)}>
                <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                <TableCell>{invoice.customers?.name || '–'}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(invoice.subtotal || 0))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(invoice.vat_amount || 0))}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(Number(invoice.amount))}</TableCell>
                <TableCell><Badge className={statusColors[invoice.status]}>{statusLabels[invoice.status]}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : '–'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {invoice.status !== 'paid' && (
                      <Button variant="ghost" size="icon" title={t('profile.markAsPaid')} onClick={async () => {
                        try { await updateStatus.mutateAsync({ id: invoice.id, status: 'paid' }); toast.success(t('profile.markAsPaid')); } catch { toast.error(t('common.error')); }
                      }}>
                        <DollarSign className="h-4 w-4 text-accent" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title={t('pages.invoices.sendEmail')} onClick={() => openEmailDialog(invoice)}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title={t('pages.invoices.generatePdf')} onClick={() => handleDownloadPdf(invoice)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title={t('common.delete') || 'Slet'} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('common.confirmDelete') || 'Slet faktura?'}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {(t('common.confirmDeleteDesc') || 'Denne handling kan ikke fortrydes.')} ({invoice.invoice_number})
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              try {
                                await deleteInvoice.mutateAsync(invoice.id);
                                toast.success(t('common.deleted') || 'Slettet');
                              } catch (err) {
                                toast.error(getErrorMessage(err) || t('common.error'));
                              }
                            }}
                          >
                            {t('common.delete') || 'Slet'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* Email send dialog */}
      <Dialog open={!!emailDialogInvoice} onOpenChange={(open) => { if (!open) setEmailDialogInvoice(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />{t('pages.invoices.sendEmailTitle')}</DialogTitle>
            <DialogDescription>{t('pages.invoices.sendEmailSubtitle')}</DialogDescription>
          </DialogHeader>
          {gmailLoading ? (
            <div className="py-8 flex justify-center"><Skeleton className="h-8 w-48" /></div>
          ) : !gmailAccount ? (
            <div className="py-6 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">{t('pages.invoices.noEmailConnected')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('pages.invoices.noEmailConnectedDesc')}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => { setEmailDialogInvoice(null); window.location.href = `/${window.location.pathname.split('/')[1]}/app/email`; }}>
                <ExternalLink className="h-4 w-4 mr-2" />{t('pages.invoices.goToEmail')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {t('pages.invoices.sendEmail')}: <span className="font-medium text-foreground">{gmailAccount.email_address}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {locale === 'da' ? 'PDF vedhæftes som link' : 'PDF attached as link'}
                </div>
              </div>

              {/* Template selector for email PDF */}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">{locale === 'da' ? 'PDF skabelon' : 'PDF Template'}:</Label>
                <Select value={pdfTemplate} onValueChange={(v) => setPdfTemplate(v as InvoiceTemplate)}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2"><Label>{t('pages.invoices.recipientEmail')}</Label><Input value={emailTo} onChange={e => setEmailTo(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('pages.invoices.emailSubject')}</Label><Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('pages.invoices.emailMessage')}</Label><Textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={8} /></div>
              <Button onClick={handleSendEmail} disabled={sendingWithPdf || !emailTo} className="w-full">
                {sendingWithPdf ? t('pages.invoices.sending') : <><Send className="h-4 w-4 mr-2" />{t('pages.invoices.sendCta')}</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice detail Sheet with edit */}
      <Sheet open={!!selectedInvoice} onOpenChange={(open) => { if (!open) { setSelectedInvoice(null); setEditingInvoice(null); } }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedInvoice && !editingInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('pages.invoices.invoiceNo')} {selectedInvoice.invoice_number}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Status & actions */}
                <div className="flex items-center gap-3">
                  <Badge className={statusColors[selectedInvoice.status]}>{statusLabels[selectedInvoice.status]}</Badge>
                  {selectedInvoice.status !== 'paid' && (
                    <Select value={selectedInvoice.status} onValueChange={async (v) => {
                      try {
                        await updateStatus.mutateAsync({ id: selectedInvoice.id, status: v });
                        setSelectedInvoice({ ...selectedInvoice, status: v as InvoiceWithCustomer['status'] });
                        toast.success(t('pipeline.leadUpdated'));
                      } catch { toast.error(t('common.error')); }
                    }}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{statusLabels.draft}</SelectItem>
                        <SelectItem value="sent">{statusLabels.sent}</SelectItem>
                        <SelectItem value="paid">{statusLabels.paid}</SelectItem>
                        <SelectItem value="overdue">{statusLabels.overdue}</SelectItem>
                        <SelectItem value="cancelled">{statusLabels.cancelled}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Customer info */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase">{t('pages.invoices.customer')}</Label>
                  <div className="p-3 rounded-lg border border-border bg-card/50">
                    <p className="font-medium">{selectedInvoice.customers?.name || '–'}</p>
                    <p className="text-sm text-muted-foreground">{selectedInvoice.customers?.email || ''}</p>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.invoices.issued')}</Label>
                    <p className="text-sm font-medium">{selectedInvoice.issued_at ? new Date(selectedInvoice.issued_at).toLocaleDateString() : '–'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.invoices.dueDate')}</Label>
                    <p className="text-sm font-medium">{selectedInvoice.due_date ? new Date(selectedInvoice.due_date).toLocaleDateString() : '–'}</p>
                  </div>
                </div>

                <Separator />

                {/* Lines */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase">{t('pages.invoices.invoiceLines')}</Label>
                  <div className="space-y-1">
                    {((selectedInvoice.lines as unknown as InvoiceLine[]) || []).map((l, i) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <span>{l.description} <span className="text-muted-foreground">×{l.quantity}</span></span>
                        <span className="font-medium">{formatCurrency(l.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('pages.invoices.subtotal')}</span><span>{formatCurrency(Number(selectedInvoice.subtotal || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('pages.invoices.vatAmount')} ({selectedInvoice.vat_rate || 0}%)</span><span>{formatCurrency(Number(selectedInvoice.vat_amount || 0))}</span></div>
                  {selectedInvoice.vat_note && <p className="text-xs text-muted-foreground italic">{selectedInvoice.vat_note}</p>}
                  <div className="flex justify-between font-bold text-base text-primary pt-2 border-t border-border">
                    <span>{t('pages.invoices.totalInclVat')}</span>
                    <span>{formatCurrency(Number(selectedInvoice.amount))}</span>
                  </div>
                </div>

                {selectedInvoice.notes && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-xs text-muted-foreground">{t('pages.invoices.notes')}</Label>
                      <p className="text-sm mt-1">{selectedInvoice.notes}</p>
                    </div>
                  </>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-4 flex-wrap">
                  {selectedInvoice.status === 'draft' && (
                    <Button variant="outline" className="flex-1" onClick={() => {
                      setEditingInvoice({
                        ...selectedInvoice,
                        editLines: [...((selectedInvoice.lines as unknown as InvoiceLine[]) || [])],
                        editDueDate: selectedInvoice.due_date || '',
                        editNotes: selectedInvoice.notes || '',
                      });
                    }}>
                      <FileText className="h-4 w-4 mr-2" />{t('common.edit') || 'Rediger'}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => handleDownloadPdf(selectedInvoice)}>
                    <Download className="h-4 w-4 mr-2" />{t('pages.invoices.generatePdf')}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => { openEmailDialog(selectedInvoice); setSelectedInvoice(null); }}>
                    <Send className="h-4 w-4 mr-2" />{t('pages.invoices.sendEmail')}
                  </Button>
                </div>
              </div>
            </>
          )}
          {editingInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t('common.edit') || 'Rediger'}: {editingInvoice.invoice_number}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>{t('pages.invoices.dueDate')}</Label>
                  <Input type="date" value={editingInvoice.editDueDate} onChange={e => setEditingInvoice({ ...editingInvoice, editDueDate: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>{t('pages.invoices.invoiceLines')}</Label>
                  {editingInvoice.editLines.map((line, i) => (
                    <div key={i} className="grid gap-2 grid-cols-[1fr_60px_80px_32px] items-end">
                      <Input value={line.description} onChange={e => {
                        const updated = [...editingInvoice.editLines];
                        updated[i] = { ...updated[i], description: e.target.value };
                        setEditingInvoice({ ...editingInvoice, editLines: updated });
                      }} />
                      <Input type="number" min={1} value={line.quantity} onChange={e => {
                        const updated = [...editingInvoice.editLines];
                        const qty = Number(e.target.value);
                        updated[i] = { ...updated[i], quantity: qty, total: qty * updated[i].unit_price };
                        setEditingInvoice({ ...editingInvoice, editLines: updated });
                      }} />
                      <Input type="number" min={0} value={line.unit_price} onChange={e => {
                        const updated = [...editingInvoice.editLines];
                        const price = Number(e.target.value);
                        updated[i] = { ...updated[i], unit_price: price, total: updated[i].quantity * price };
                        setEditingInvoice({ ...editingInvoice, editLines: updated });
                      }} />
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingInvoice({ ...editingInvoice, editLines: editingInvoice.editLines.filter((_, idx) => idx !== i) });
                      }} disabled={editingInvoice.editLines.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingInvoice({ ...editingInvoice, editLines: [...editingInvoice.editLines, { description: '', quantity: 1, unit_price: 0, total: 0 }] });
                  }}><Plus className="h-3 w-3 mr-1" />{t('pages.invoices.addLine')}</Button>
                </div>

                <div className="space-y-2">
                  <Label>{t('pages.invoices.notes')}</Label>
                  <Textarea value={editingInvoice.editNotes} onChange={e => setEditingInvoice({ ...editingInvoice, editNotes: e.target.value })} rows={3} />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingInvoice(null)}>{t('common.cancel') || 'Annuller'}</Button>
                  <Button className="flex-1" disabled={savingEdit} onClick={async () => {
                    setSavingEdit(true);
                    try {
                      const editLines = editingInvoice.editLines;
                      const editSubtotal = editLines.reduce((s, l) => s + l.total, 0);
                      const editVatRate = editingInvoice.vat_rate || 25;
                      const editVatAmount = editSubtotal * (editVatRate / 100);
                      const editTotal = editSubtotal + editVatAmount;

                      const { error } = await supabase.from('invoices').update({
                        lines: editLines as unknown as Tables<'invoices'>['lines'],
                        subtotal: editSubtotal,
                        vat_amount: editVatAmount,
                        amount: editTotal,
                        due_date: editingInvoice.editDueDate || null,
                        notes: editingInvoice.editNotes || null,
                      }).eq('id', editingInvoice.id);
                      if (error) throw error;
                      toast.success(t('common.saved') || 'Gemt');
                      setEditingInvoice(null);
                      setSelectedInvoice(null);
                      window.location.reload();
                    } catch (err) {
                      toast.error(getErrorMessage(err) || t('common.error'));
                    } finally {
                      setSavingEdit(false);
                    }
                  }}>{savingEdit ? t('common.loading') : (t('common.save') || 'Gem')}</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
