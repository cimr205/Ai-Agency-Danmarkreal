import { ArrowLeft, MapPin, Hash, Mail, Phone, Calendar, Briefcase, FileText, MoreHorizontal } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { ClientQuickWorkflow } from "@/components/clients/ClientQuickWorkflow";
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
  const params = useParams();
  const navigate = useNavigate();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const initials = customer.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();
  const memberSince = new Date(customer.created_at).toLocaleDateString("da-DK", { month: "short", year: "numeric" });

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
              <h1 className="text-[26px] font-display font-semibold tracking-tight text-foreground leading-none">
                {customer.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-mono text-emerald-500/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktiv
              </span>
            </div>
            <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12.5px] text-muted-foreground">
              {customer.vat_number && (
                <span className="inline-flex items-center gap-1.5"><Hash className="h-3 w-3" />{customer.vat_number}</span>
              )}
              {customer.address && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" />{customer.address}</span>
              )}
              <span className="text-muted-foreground/70">Klient siden {memberSince}</span>
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
          <button
            title="Mere"
            className="grid place-items-center h-8 w-8 rounded-md border border-border/50 bg-background/30 hover:bg-foreground/[0.04] hover:border-border text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground border-l-2 border-border/60 pl-4">
        <span className="text-foreground/70 font-mono uppercase tracking-[0.1em] text-[10px] mr-2">Puls</span>
        {pulseParts.join(" · ")}
      </p>
    </div>
  );
}
