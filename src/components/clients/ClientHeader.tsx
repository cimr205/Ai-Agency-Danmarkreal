import { useState } from "react";
import { ArrowLeft, MapPin, Hash, Mail, Phone, Calendar, Briefcase, FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { ClientQuickWorkflow } from "@/components/clients/ClientQuickWorkflow";
import { useUpdateCustomer, useDeleteCustomer } from "@/hooks/api/useFinance";
import { isValidEmail, isValidPhone, MAX_NAME_LENGTH } from "@/lib/validation";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  customer: Tables<"customers">;
  stats: {
    openDeals: number;
    overdueInvoices: number;
    lastTouch?: string;
  };
}

function relTime(iso?: string) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - +new Date(iso)) / 86400000);
  if (days === 0) return "i dag";
  if (days === 1) return "i går";
  if (days < 30) return `${days}d siden`;
  if (days < 365) return `${Math.floor(days / 30)}m siden`;
  return `${Math.floor(days / 365)}å siden`;
}

export function ClientHeader({ customer, stats }: Props) {
  const { t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const initials = customer.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();
  const memberSince = new Date(customer.created_at).toLocaleDateString("da-DK", { month: "short", year: "numeric" });

  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: customer.name, email: customer.email, phone: customer.phone || "",
    address: customer.address || "", vat_number: customer.vat_number || "",
  });

  const openEdit = () => {
    setEditForm({
      name: customer.name, email: customer.email, phone: customer.phone || "",
      address: customer.address || "", vat_number: customer.vat_number || "",
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editForm.name || !editForm.email) { toast.error(t('clients.nameRequired')); return; }
    if (!isValidEmail(editForm.email)) { toast.error(t('clients.invalidEmail')); return; }
    if (!isValidPhone(editForm.phone)) { toast.error(t('clients.invalidPhone')); return; }
    try {
      await updateCustomer.mutateAsync({ id: customer.id, ...editForm });
      toast.success(t('clients.updated_success'));
      setEditOpen(false);
    } catch {
      toast.error(t('clients.updated_error'));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCustomer.mutateAsync(customer.id);
      toast.success(t('clients.deleted_success'));
      navigate(`${base}/clients`);
    } catch {
      toast.error(t('clients.deleted_error'));
    }
  };

  const pulseParts = [
    `${stats.openDeals} ${stats.openDeals === 1 ? "åben deal" : "åbne deals"}`,
    stats.overdueInvoices > 0 ? `${stats.overdueInvoices} forfaldne fakturaer` : null,
    stats.lastTouch ? `kontakt ${relTime(stats.lastTouch)}` : "ingen aktivitet endnu",
  ].filter(Boolean);

  const actions = [
    { icon: Mail,      label: "Mail",     onClick: () => customer.email && (window.location.href = `mailto:${customer.email}`) },
    { icon: Phone,     label: "Ring",     onClick: () => customer.phone && (window.location.href = `tel:${customer.phone}`) },
    { icon: Calendar,  label: "Møde",     onClick: () => navigate(`${base}/work/calendar?create=true&customer=${customer.id}`) },
    { icon: Briefcase, label: "Ny deal",  onClick: () => navigate(`${base}/crm/deals?create=true&customer=${customer.id}`) },
    { icon: FileText,  label: "Faktura",  onClick: () => navigate(`${base}/finance/invoices?create=true&customer=${customer.id}`) },
  ];

  return (
    <div className="space-y-6">
      <Link
        to={`${base}/clients`}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono uppercase tracking-[0.1em] transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> klienter
      </Link>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-5 min-w-0 flex-1">
          <div className="h-14 w-14 rounded-lg bg-foreground/[0.06] border border-border/60 grid place-items-center text-foreground/80 font-display text-lg font-medium shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-[26px] font-display font-semibold tracking-tight text-foreground leading-tight line-clamp-2 break-words max-w-xl"
                title={customer.name}
              >
                {customer.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-mono text-emerald-500/90 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktiv
              </span>
            </div>
            <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12.5px] text-muted-foreground">
              {customer.vat_number && (
                <span className="inline-flex items-center gap-1.5 min-w-0"><Hash className="h-3 w-3 shrink-0" /><span className="truncate max-w-[200px]">{customer.vat_number}</span></span>
              )}
              {customer.address && (
                <span className="inline-flex items-center gap-1.5 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate max-w-[240px]">{customer.address}</span></span>
              )}
              <span className="text-muted-foreground/70 shrink-0">Klient siden {memberSince}</span>
            </div>
          </div>
        </div>

        {/* Quick action cluster */}
        <div className="flex items-center gap-1 shrink-0">
          <ClientQuickWorkflow customer={{ id: customer.id, name: customer.name }} />
          <span className="mx-1 h-5 w-px bg-border/60" />
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              title={a.label}
              className="group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border/50 bg-background/30 hover:bg-foreground/[0.04] hover:border-border text-[12px] text-foreground/85 transition-colors"
            >
              <a.icon className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-foreground/90" />
              <span className="hidden sm:inline">{a.label}</span>
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Mere"
                className="grid place-items-center h-8 w-8 rounded-md border border-border/50 bg-background/30 hover:bg-foreground/[0.04] hover:border-border text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openEdit} className="gap-2">
                <Pencil className="h-3.5 w-3.5" /> {t('clients.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> {t('clients.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground border-l-2 border-border/60 pl-4">
        <span className="text-foreground/70 font-mono uppercase tracking-[0.1em] text-[10px] mr-2">Puls</span>
        {pulseParts.join(" · ")}
      </p>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.editTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client-name">{t('pages.leads.name')} *</Label>
              <Input id="edit-client-name" value={editForm.name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-email">{t('pages.leads.email')} *</Label>
              <Input id="edit-client-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-phone">{t('pages.leads.phone')}</Label>
              <Input id="edit-client-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-address">{t('companySettings.address')}</Label>
              <Input id="edit-client-address" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-vat">{t('companySettings.cvr')}/VAT</Label>
              <Input id="edit-client-vat" value={editForm.vat_number} onChange={(e) => setEditForm({ ...editForm, vat_number: e.target.value })} />
            </div>
            <Button onClick={handleUpdate} disabled={updateCustomer.isPending} className="w-full">
              {updateCustomer.isPending ? t('common.loading') : t('clients.editCta')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clients.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('clients.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('clients.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
