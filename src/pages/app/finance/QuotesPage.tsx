import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, FileText, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLeads } from '@/hooks/api/useLeads';
import type { Json } from '@/integrations/supabase/types';

type QuoteLine = { description: string; quantity: number; unit_price: number };

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  accepted: 'bg-emerald-500/10 text-emerald-600',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

function useQuotes() {
  return useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; lead_id?: string; lines: QuoteLine[]; subtotal: number; vat_rate: number; vat_amount: number; total: number; valid_until?: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase.from('quotes').insert({
        ...input,
        company_id: profile.company_id,
        created_by: session.user.id,
        lines: input.lines as unknown as Json,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

export default function QuotesPage() {
  const { t } = useI18n();
  const { format: formatCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [leadId, setLeadId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [vatRate, setVatRate] = useState(25);

  const { data: quotes, isLoading } = useQuotes();
  const { data: leadsResult } = useLeads({ page: 0 });
  const allLeads = leadsResult?.data ?? [];
  const createQuote = useCreateQuote();
  const queryClient = useQueryClient();
  const transitionQuote = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc('transition_quote', { p_quote_id: id, p_target_status: status });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  });
  const convertQuote = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) throw new Error('No company');
      const { data: number, error: numberError } = await supabase.rpc('generate_invoice_number', { _company_id: profile.company_id });
      if (numberError) throw numberError;
      const { error } = await supabase.rpc('quote_to_invoice', {
        p_quote_id: id, p_invoice_number: number as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(t('quotes.created'));
    },
  });

  const filteredQuotes = (quotes ?? []).filter(q =>
    q.title?.toLowerCase().includes(search.toLowerCase())
  );

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const addLine = () => setLines(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const updateLine = (idx: number, field: keyof QuoteLine, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (!title.trim() || lines.length === 0) { toast.error(t('quotes.titleAndLineRequired')); return; }
    try {
      await createQuote.mutateAsync({
        title, lead_id: leadId || undefined, lines, subtotal, vat_rate: vatRate, vat_amount: vatAmount, total,
        valid_until: validUntil || undefined, notes: notes || undefined,
      });
      toast.success(t('quotes.created'));
      setIsCreateOpen(false);
      setTitle(''); setLeadId(''); setLines([{ description: '', quantity: 1, unit_price: 0 }]); setNotes(''); setValidUntil('');
    } catch { toast.error(t('common.error')); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('quotes.title')}</h1>
          <p className="text-muted-foreground">{t('quotes.subtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('quotes.newQuote')}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t('quotes.createTitle')}</DialogTitle><DialogDescription>{t('quotes.createSubtitle')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t('quotes.titleLabel')} *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q-2026-001" /></div>
                <div>
                  <Label>{t('quotes.lead')}</Label>
                  <Select value={leadId} onValueChange={setLeadId}>
                    <SelectTrigger><SelectValue placeholder={t('quotes.selectLead')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {allLeads.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t('quotes.lines')}</Label>
                <div className="space-y-2 mt-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder={t('quotes.descriptionPlaceholder')} className="flex-1" />
                      <Input type="number" value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-20" />
                      <Input type="number" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-28" />
                      <span className="text-sm font-medium w-24 text-right">{formatCurrency(line.quantity * line.unit_price)}</span>
                      {lines.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(idx)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />{t('quotes.addLine')}</Button>
                </div>
              </div>

              <div className="border-t pt-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>{t('quotes.subtotal')}</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between"><span>{t('quotes.vat')} ({vatRate}%)</span><span>{formatCurrency(vatAmount)}</span></div>
                <div className="flex justify-between font-bold text-lg"><span>{t('quotes.total')}</span><span>{formatCurrency(total)}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t('quotes.validUntil')}</Label><Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
                <div><Label>{t('quotes.vatRate')}</Label><Input type="number" value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} /></div>
              </div>

              <div><Label>{t('quotes.notes')}</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('quotes.notesPlaceholder')} rows={2} /></div>

              <Button onClick={handleCreate} disabled={createQuote.isPending} className="w-full">
                {createQuote.isPending ? t('common.saving') : t('quotes.createCta')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{filteredQuotes.length}</div><p className="text-xs text-muted-foreground">{t('quotes.totalQuotes')}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-primary">{formatCurrency(filteredQuotes.reduce((s, q) => s + Number(q.total || 0), 0))}</div><p className="text-xs text-muted-foreground">{t('quotes.totalValue')}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-emerald-600">{filteredQuotes.filter(q => q.status === 'accepted').length}</div><p className="text-xs text-muted-foreground">{t('quotes.accepted')}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{filteredQuotes.filter(q => q.status === 'sent').length}</div><p className="text-xs text-muted-foreground">{t('quotes.pending')}</p></CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t('quotes.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">{t('quotes.empty')}</p>
              <Button variant="outline" className="mt-4" onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('quotes.createFirst')}</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quotes.titleLabel')}</TableHead>
                  <TableHead>{t('quotes.status')}</TableHead>
                  <TableHead>{t('quotes.total')}</TableHead>
                  <TableHead>{t('quotes.validUntil')}</TableHead>
                  <TableHead>{t('common.created')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.title}</TableCell>
                    <TableCell><Badge className={statusColors[quote.status] || ''}>{quote.status}</Badge></TableCell>
                    <TableCell className="font-medium">{formatCurrency(quote.total)}</TableCell>
                    <TableCell className="text-muted-foreground">{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(quote.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {quote.status === 'draft' && <Button size="sm" variant="outline" onClick={() => transitionQuote.mutate({ id: quote.id, status: 'sent' })}><ArrowRight className="h-3.5 w-3.5 mr-1" />{t('quotes.sent')}</Button>}
                        {quote.status === 'sent' && <>
                          <Button size="sm" variant="outline" onClick={() => transitionQuote.mutate({ id: quote.id, status: 'accepted' })}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />{t('quotes.accepted')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => transitionQuote.mutate({ id: quote.id, status: 'rejected' })}>{t('quotes.rejected')}</Button>
                        </>}
                        {quote.status === 'accepted' && !quote.converted_invoice_id && <Button size="sm" onClick={() => convertQuote.mutate(quote.id)}><FileText className="h-3.5 w-3.5 mr-1" />{t('invoices.createInvoice')}</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
