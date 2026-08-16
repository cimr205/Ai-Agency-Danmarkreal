import { useState, useCallback, useMemo } from 'react';
import { usePayments, useCreatePayment, useInvoices } from '@/hooks/api/useFinance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, CreditCard, CheckCircle, Clock, Building2, Smartphone, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-700',
  completed: 'bg-accent/10 text-accent',
  failed: 'bg-destructive/10 text-destructive',
};

const paymentMethods = [
  { value: 'bank_transfer', label: 'bankTransfer', icon: Building2 },
  { value: 'stripe', label: 'Stripe', icon: CreditCard, raw: true },
  { value: 'quickpay', label: 'QuickPay', icon: CreditCard, raw: true },
  { value: 'mobilepay', label: 'MobilePay', icon: Smartphone, raw: true },
];

export default function PaymentsPage() {
  const { t, locale } = useI18n();
  const { format: formatCurrency } = useCurrency();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payments, isLoading, error } = usePayments();
  const { data: invoices } = useInvoices();
  const createPayment = useCreatePayment();

  const statusLabels: Record<string, string> = {
    pending: t('payments.pending'),
    completed: t('payments.completed'),
    failed: t('payments.failed'),
  };

  const methodLabels: Record<string, string> = {
    bank_transfer: t('payments.bankTransfer'),
    stripe: 'Stripe',
    quickpay: 'QuickPay',
    mobilepay: 'MobilePay',
  };

  const allPayments = payments ?? [];
  const filteredPayments = statusFilter === 'all' ? allPayments : allPayments.filter(p => p.status === statusFilter);
  const completedPayments = allPayments.filter(p => p.status === 'completed');
  const pendingPayments = allPayments.filter(p => p.status === 'pending');
  const totalCompleted = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const unpaidInvoices = invoices?.filter(i => i.status !== 'paid' && i.status !== 'cancelled') ?? [];
  const selectedInvoice = unpaidInvoices.find(i => i.id === selectedInvoiceId);

  const handleCreate = async () => {
    if (!selectedInvoiceId || !amount) {
      toast.error(t('payments.selectError'));
      return;
    }
    try {
      await createPayment.mutateAsync({
        invoice_id: selectedInvoiceId,
        amount: parseFloat(amount),
        payment_method: method,
        status: 'completed',
      });
      toast.success(t('payments.success'));
      setSelectedInvoiceId('');
      setAmount('');
      setMethod('bank_transfer');
      setIsCreateOpen(false);
    } catch {
      toast.error(t('payments.error'));
    }
  };

  const handleExport = useCallback(() => {
    if (allPayments.length === 0) return;
    const csv = ["Invoice,Method,Amount,Status,Paid", ...allPayments.map(p =>
      `${p.invoices?.invoice_number || ''},${p.payment_method || ''},${p.amount},${p.status},${p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ''}`
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allPayments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('payments.title')}</h1>
          <p className="text-muted-foreground">{t('payments.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {allPayments.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" /> {t('payments.exportHistory')}
            </Button>
          )}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('payments.registerPayment')}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('payments.registerTitle')}</DialogTitle>
                <DialogDescription>{t('payments.registerDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('payments.invoice')} *</Label>
                  <Select value={selectedInvoiceId} onValueChange={(v) => {
                    setSelectedInvoiceId(v);
                    const inv = unpaidInvoices.find(i => i.id === v);
                    if (inv) setAmount(String(inv.amount));
                  }}>
                    <SelectTrigger><SelectValue placeholder={t('payments.selectInvoice')} /></SelectTrigger>
                    <SelectContent>
                      {unpaidInvoices.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoice_number} – {formatCurrency(Number(inv.amount))} ({inv.customers?.name || '–'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('payments.paymentMethod')} *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map(m => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.value}
                          onClick={() => setMethod(m.value)}
                          className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
                            method === m.value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {m.raw ? m.label : t(`payments.${m.label}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('payments.amount')} *</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" />
                  {selectedInvoice && (
                    <p className="text-xs text-muted-foreground">{t('payments.invoiceAmount')}: {formatCurrency(Number(selectedInvoice.amount))}</p>
                  )}
                </div>

                <Button onClick={handleCreate} disabled={createPayment.isPending} className="w-full">
                  {createPayment.isPending ? t('payments.registering') : t('payments.registerBtn')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center"><CheckCircle className="h-6 w-6 text-accent" /></div><div><p className="text-sm text-muted-foreground">{t('payments.completed')}</p><p className="text-2xl font-bold text-accent">{formatCurrency(totalCompleted)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center"><Clock className="h-6 w-6 text-yellow-600" /></div><div><p className="text-sm text-muted-foreground">{t('payments.pending')}</p><p className="text-2xl font-bold">{pendingPayments.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><CreditCard className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('payments.totalPayments')}</p><p className="text-2xl font-bold">{allPayments.length}</p></div></div></CardContent></Card>
      </div>

      {/* Status filter tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">{t('common.all')} ({allPayments.length})</TabsTrigger>
          <TabsTrigger value="completed">{t('payments.completed')} ({completedPayments.length})</TabsTrigger>
          <TabsTrigger value="pending">{t('payments.pending')} ({pendingPayments.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('payments.invoiceCol')}</TableHead>
              <TableHead>{t('payments.methodCol')}</TableHead>
              <TableHead className="text-right">{t('payments.amountCol')}</TableHead>
              <TableHead>{t('payments.statusCol')}</TableHead>
              <TableHead>{t('payments.paidCol')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
            )) : filteredPayments.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{error ? t('payments.fetchError') : t('payments.noPayments')}</TableCell></TableRow>
            ) : filteredPayments.map(payment => (
              <TableRow key={payment.id}>
                <TableCell className="font-mono font-medium">{payment.invoices?.invoice_number || '–'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{methodLabels[payment.payment_method || ''] || payment.payment_method || '–'}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(Number(payment.amount))}</TableCell>
                <TableCell><Badge className={statusColors[payment.status]}>{statusLabels[payment.status]}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
