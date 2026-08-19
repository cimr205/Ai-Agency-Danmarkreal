import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { useCustomers, useCreateCustomer } from "@/hooks/api/useFinance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Building2, ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { CvrLookupField } from "@/components/shared/CvrLookupField";
import { isValidEmail, isValidPhone, MAX_NAME_LENGTH } from "@/lib/validation";

export default function ClientsListPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const [q, setQ] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", address: "", vat_number: "", phone: "" });
  const { data, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();

  const list = (data ?? []).filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(q.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newClient.name || !newClient.email) {
      toast.error(t('clients.nameRequired'));
      return;
    }
    if (!isValidEmail(newClient.email)) {
      toast.error(t('clients.invalidEmail'));
      return;
    }
    if (!isValidPhone(newClient.phone)) {
      toast.error(t('clients.invalidPhone'));
      return;
    }
    try {
      await createCustomer.mutateAsync(newClient);
      toast.success(t('clients.created_success'));
      setNewClient({ name: "", email: "", address: "", vat_number: "", phone: "" });
      setIsCreateOpen(false);
    } catch {
      toast.error(t('clients.created_error'));
    }
  };

  const createDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />{t('clients.newClient')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('clients.createTitle')}</DialogTitle>
          <DialogDescription>{t('clients.createSubtitle')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <CvrLookupField onResult={({ name, address, cvr }) => {
            setNewClient(prev => ({ ...prev, name, address, vat_number: cvr }));
          }} />
          <div className="space-y-2">
            <Label htmlFor="client-name">{t('pages.leads.name')} *</Label>
            <Input id="client-name" value={newClient.name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Firma ApS" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-email">{t('pages.leads.email')} *</Label>
            <Input id="client-email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="kontakt@firma.dk" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-phone">{t('pages.leads.phone')}</Label>
            <Input id="client-phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder={t('pages.leads.phonePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-address">{t('companySettings.address')}</Label>
            <Input id="client-address" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-vat">{t('companySettings.cvr')}/VAT</Label>
            <Input id="client-vat" value={newClient.vat_number} onChange={(e) => setNewClient({ ...newClient, vat_number: e.target.value })} placeholder="DK12345678" />
          </div>
          <Button onClick={handleCreate} disabled={createCustomer.isPending} className="w-full">
            {createCustomer.isPending ? t('common.loading') : t('clients.createCta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60">Connected Business Graph</div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight text-foreground mt-1">{t('clients.title')}</h1>
            <p className="text-[13px] text-muted-foreground mt-1.5">{t('clients.subtitle')}</p>
          </div>
          {list.length > 0 && createDialog}
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder={t('clients.searchPlaceholder')}
            className="pl-9 h-9 bg-transparent border-border/60 text-[13px]"
          />
        </div>
      </header>

      <ul className="divide-y divide-border/50 border-y border-border/50">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="py-4"><Skeleton className="h-6 w-full" /></li>
        ))}
        {!isLoading && list.length === 0 && (
          <li className="py-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-11 w-11 rounded-full bg-foreground/[0.04] border border-border/50 grid place-items-center">
              <Building2 className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-[13px] text-muted-foreground">{t('clients.empty')}</p>
            {createDialog}
          </li>
        )}
        {list.map(c => {
          const initials = c.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
          return (
            <li key={c.id}>
              <Link
                to={`${base}/clients/${c.id}`}
                className="group py-4 flex items-center gap-4 hover:bg-foreground/[0.02] -mx-4 px-4 rounded-md transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-foreground/[0.04] border border-border/50 grid place-items-center text-[12px] font-display text-foreground/80">
                  {initials || <Building2 className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-foreground/90 truncate">{c.name}</div>
                  <div className="text-[11.5px] text-muted-foreground/70 truncate">{c.email}</div>
                </div>
                <span className="text-[10.5px] font-mono text-muted-foreground/50 hidden sm:block">
                  {new Date(c.created_at).toLocaleDateString("da-DK", { month: "short", year: "numeric" })}
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
