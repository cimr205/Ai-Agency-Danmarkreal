import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import { useCustomers, useCreateCustomer } from '@/hooks/api/useFinance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Users, Mail, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { CvrLookupField } from '@/components/shared/CvrLookupField';
import { useI18n } from '@/lib/i18n';

export default function CustomersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', address: '', vat_number: '', phone: '' });

  const { data, isLoading, error } = useCustomers();
  const createCustomer = useCreateCustomer();

  const filteredCustomers = (data ?? []).filter(customer =>
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newCustomer.name || !newCustomer.email) {
      toast.error(t('pages.leads.nameRequired'));
      return;
    }
    try {
      await createCustomer.mutateAsync(newCustomer);
      toast.success(t('pages.leads.created_success'));
      setNewCustomer({ name: '', email: '', address: '', vat_number: '', phone: '' });
      setIsCreateOpen(false);
    } catch {
      toast.error(t('pages.leads.created_error'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('nav.customers')}</h1>
          <p className="text-muted-foreground">{t('pages.leads.subtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t('pages.leads.newLead')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('pages.leads.createTitle')}</DialogTitle>
              <DialogDescription>{t('pages.leads.createSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <CvrLookupField onResult={({ name, address, cvr }) => {
                setNewCustomer(prev => ({ ...prev, name, address, vat_number: cvr }));
              }} />
              <div className="space-y-2">
                <Label htmlFor="name">{t('pages.leads.name')} *</Label>
                <Input id="name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Firma ApS" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('pages.leads.email')} *</Label>
                <Input id="email" type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="kontakt@firma.dk" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('pages.leads.phone')}</Label>
                <Input id="phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder={t('pages.leads.phonePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">{t('companySettings.address')}</Label>
                <Input id="address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat">{t('companySettings.cvr')}/VAT</Label>
                <Input id="vat" value={newCustomer.vat_number} onChange={(e) => setNewCustomer({ ...newCustomer, vat_number: e.target.value })} placeholder="DK12345678" />
              </div>
              <Button onClick={handleCreate} disabled={createCustomer.isPending} className="w-full">
                {createCustomer.isPending ? t('common.loading') : t('pages.leads.createCta')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('pages.leads.total')}</p>
                <p className="text-2xl font-bold">{data?.length ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('pages.leads.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pages.leads.name')}</TableHead>
                <TableHead>{t('pages.leads.email')}</TableHead>
                <TableHead>{t('pages.leads.created')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {error ? t('pages.leads.fetchError') : t('pages.leads.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer group"
                    onClick={() => navigate(`${base}/clients/${customer.id}`)}
                  >
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5 group-hover:text-primary transition-colors">
                        {customer.name}
                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <a href={`mailto:${customer.email}`} className="text-primary hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3" />{customer.email}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
