import type { ComponentType } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase,
  Calendar, CheckCircle2, Clock3, FileText, Mail, PhoneCall, RadioTower,
  ShieldCheck, Target, Users, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { isLocale } from "@/lib/i18n";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard, type FocusItem } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import { cn } from "@/lib/utils";

const FOCUS_ICON = { invoice: FileText, deal: Briefcase, lead: PhoneCall } as const;
const FOCUS_CTA = { invoice: "Send rykker", deal: "Følg op", lead: "Ring" } as const;

function focusItemText(item: FocusItem): string {
  if (item.kind === "invoice") {
    return `Faktura #${item.label} er ${item.days} dag${item.days === 1 ? "" : "e"} forfalden${item.company ? ` hos ${item.company}` : ""}`;
  }
  if (item.kind === "deal") {
    return `Deal "${item.label}" har stået i ${item.stage} i ${item.days} dag${item.days === 1 ? "" : "e"}`;
  }
  const who = item.company ? `${item.label} hos ${item.company}` : item.label;
  return item.overdue ? `${who}: opfølgning er overskredet` : `${who}: ${item.days} dage uden kontakt`;
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${routeLocale}/app`;
  const { format } = useCurrency();
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();

  const firstName = (profile?.full_name || "").split(" ")[0] || "der";
  const today = new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short" }).replace(/\.$/, "");
  const monthValue = d?.invoices?.monthValue ?? 0;
  const lastMonthValue = d?.invoices?.lastMonthValue ?? 0;
  const momDelta = lastMonthValue > 0 ? Math.round(((monthValue - lastMonthValue) / lastMonthValue) * 100) : null;
  const openDeals = (d?.deals?.total ?? 0) - (d?.deals?.won ?? 0) - (d?.deals?.lost ?? 0);
  const overdueValue = d?.invoices?.overdueValue ?? 0;
  const activeWork = (d?.tasks?.pending ?? 0) + (d?.tasks?.inProgress ?? 0);
  const focusItems = d?.focusItems ?? [];
  const pipelineStages = (d?.pipeline?.stages ?? []).filter((stage) => stage.count > 0);
  const meetings = d?.today?.meetings ?? [];
  const tasks = d?.today?.tasks ?? [];

  const pulse = [
    {
      label: "Cash collected",
      value: isLoading ? null : format(monthValue),
      detail: typeof momDelta === "number" ? `${momDelta >= 0 ? "+" : "-"}${Math.abs(momDelta)}% vs. sidste måned` : "første aktive måned",
      href: `${base}/finance/invoices`,
      tone: momDelta !== null && momDelta < 0 ? "risk" : "strong",
      icon: Wallet,
    },
    {
      label: "Pipeline",
      value: isLoading ? null : format(d?.deals?.openValue ?? 0),
      detail: `${openDeals} åbne muligheder`,
      href: `${base}/crm/deals?view=board`,
      tone: "strong",
      icon: Briefcase,
    },
    {
      label: "Pressure",
      value: isLoading ? null : format(overdueValue),
      detail: `${d?.invoices?.overdue ?? 0} forfaldne fakturaer`,
      href: `${base}/finance/invoices`,
      tone: overdueValue > 0 ? "risk" : "quiet",
      icon: AlertTriangle,
    },
    {
      label: "Workload",
      value: isLoading ? null : String(activeWork),
      detail: `${tasks.length} opgaver i dag`,
      href: `${base}/work/tasks`,
      tone: activeWork > 8 ? "risk" : "quiet",
      icon: CheckCircle2,
    },
  ] as const;

  const quickActions = [
    { icon: Target, label: "Lead", href: `${base}/crm/leads?create=true` },
    { icon: Briefcase, label: "Deal", href: `${base}/crm/deals?create=true` },
    { icon: FileText, label: "Faktura", href: `${base}/finance/invoices?create=true` },
    { icon: Calendar, label: "Møde", href: `${base}/work/calendar?create=true` },
    { icon: Mail, label: "Mail", href: `${base}/email/emails?compose=true` },
  ];

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden border border-border bg-card">
        <div className="absolute inset-y-0 left-0 w-1 bg-stamp" aria-hidden="true" />
        <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Agency Danmark</span>
              <span className="h-1 w-1 rounded-full bg-stamp" />
              <span>Operating brief</span>
              <span className="h-1 w-1 rounded-full bg-stamp" />
              <span>{today}</span>
            </div>
            <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_260px]">
              <div>
                <h1 className="max-w-[760px] text-[34px] font-semibold leading-[1.03] text-foreground sm:text-[44px]">
                  Hej {firstName}, her er virksomhedens puls lige nu.
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
                  Pipeline, cashflow, opgaver og beslutninger samlet i ét arbejdsbillede.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 self-end">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.href)}
                    className="group flex h-12 items-center justify-between border border-border bg-background px-3 text-left text-[12px] font-semibold text-foreground transition-colors hover:border-stamp/60"
                  >
                    <span>{action.label}</span>
                    <action.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-stamp" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border bg-foreground p-6 text-background xl:border-l xl:border-t-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-background/55">
              <RadioTower className="h-3.5 w-3.5 text-stamp" />
              Control signal
            </div>
            <div className="mt-8 grid grid-cols-2 gap-px bg-background/15">
              <SignalTile label="Leads" value={d?.leads?.newThisMonth ?? 0} loading={isLoading} />
              <SignalTile label="Deals" value={openDeals} loading={isLoading} />
              <SignalTile label="Tasks" value={activeWork} loading={isLoading} />
              <SignalTile label="Team" value={d?.employees?.active ?? 0} loading={isLoading} />
            </div>
            <p className="mt-5 text-[12px] leading-6 text-background/60">
              Prioriter røde signaler først. Alt andet kan planlægges, batch-behandles eller automatiseres.
            </p>
          </div>
        </div>
      </section>

      {showOnboardingBanner && (
        <section className="mt-4 flex flex-wrap items-center gap-4 border border-stamp/25 bg-stamp/5 px-5 py-4">
          <ShieldCheck className="h-4 w-4 text-stamp" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-foreground">Færdiggør opsætningen for at åbne hele workspace.</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">CRM, fakturering og team kan være klar på under to minutter.</p>
          </div>
          <button onClick={() => navigate(`${base}/onboarding`)} className="flex h-9 items-center gap-1 border border-border bg-background px-3 text-[12px] font-semibold hover:border-stamp/50">
            Fortsæt <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      <section className="mt-5 grid grid-cols-1 border border-border bg-card md:grid-cols-2 xl:grid-cols-4">
        {pulse.map((item) => <PulseMetric key={item.label} {...item} />)}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="border border-border bg-card">
          <PanelHeader eyebrow="Revenue lane" title="Omsætning og likviditet" action="Åbn fakturaer" href={`${base}/finance/invoices`} />
          <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
            <div className="min-h-[300px] border-t border-border p-5">
              {d?.revenueByDay && d.revenueByDay.length > 0 ? (
                <ResponsiveContainer width="100%" height={285}>
                  <BarChart data={d.revenueByDay} barCategoryGap="26%">
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 12 }}
                      formatter={(value: number) => [format(value), "Omsætning"]}
                    />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="hsl(var(--foreground))" maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyLane title="Ingen faktureret omsætning endnu" text="Opret første faktura, så revenue-lanen begynder at vise tempo og månedlig udvikling." href={`${base}/finance/invoices?create=true`} action="Opret faktura" />
              )}
            </div>
            <div className="border-t border-border bg-background p-5 lg:border-l">
              <MicroStack
                items={[
                  { label: "Faktureret", value: format(monthValue) },
                  { label: "Udestående", value: format(overdueValue), tone: overdueValue > 0 ? "risk" : undefined },
                  { label: "Betalte fakturaer", value: String(d?.invoices?.paid ?? 0) },
                  { label: "Alle fakturaer", value: String(d?.invoices?.total ?? 0) },
                ]}
              />
            </div>
          </div>
        </div>

        <DecisionPanel focusItems={focusItems} isLoading={isLoading} base={base} onNavigate={navigate} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <PipelinePanel stages={pipelineStages} base={base} />
        <FlowPanel
          icon={Calendar}
          title="Dagens kalender"
          eyebrow="Timing"
          emptyText="Ingen møder planlagt i dag."
          href={`${base}/work/calendar`}
          isLoading={isLoading}
          items={meetings.map((meeting) => ({
            id: meeting.id,
            primary: meeting.title,
            secondary: new Date(meeting.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
          }))}
        />
        <FlowPanel
          icon={CheckCircle2}
          title="Arbejdskø"
          eyebrow="Execution"
          emptyText="Alt er lukket for i dag."
          href={`${base}/work/tasks`}
          isLoading={isLoading}
          items={tasks.map((task) => ({
            id: task.id,
            primary: task.title,
            secondary: task.due_date ? new Date(task.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "uden frist",
            tone: task.priority === "high" ? "risk" : undefined,
          }))}
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <VelocityPanel leads={d?.leads?.newThisMonth ?? 0} customers={d?.customers?.total ?? 0} unread={d?.emails?.unread ?? 0} loading={isLoading} base={base} />
        <WorkforcePanel active={d?.employees?.active ?? 0} total={d?.employees?.total ?? 0} pending={d?.tasks?.pending ?? 0} completed={d?.tasks?.completed ?? 0} loading={isLoading} base={base} />
      </section>
    </div>
  );
}

function PulseMetric({ label, value, detail, href, icon: Icon, tone }: {
  label: string;
  value: string | null;
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: "strong" | "quiet" | "risk";
}) {
  return (
    <Link to={href} className="group border-b border-border p-5 transition-colors hover:bg-background md:border-r xl:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", tone === "risk" ? "text-destructive" : tone === "strong" ? "text-stamp" : "text-muted-foreground")} />
      </div>
      <div className="mt-5">
        {value === null ? <Skeleton className="h-8 w-24" /> : <div className="text-[25px] font-semibold leading-none tabular-nums text-foreground">{value}</div>}
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {tone === "risk" ? <ArrowDownRight className="h-3.5 w-3.5 text-destructive" /> : <ArrowUpRight className="h-3.5 w-3.5 text-stamp" />}
          <span>{detail}</span>
        </div>
      </div>
    </Link>
  );
}

function SignalTile({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="bg-foreground p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-background/45">{label}</div>
      {loading ? <div className="mt-4 h-7 w-14 bg-background/10" /> : <div className="mt-4 text-[28px] font-semibold leading-none tabular-nums">{value}</div>}
    </div>
  );
}

function PanelHeader({ eyebrow, title, action, href }: { eyebrow: string; title: string; action: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-1 text-[18px] font-semibold text-foreground">{title}</h2>
      </div>
      <Link to={href} className="flex h-9 items-center gap-1 border border-border bg-background px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-stamp/60">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function MicroStack({ items }: { items: { label: string; value: string; tone?: "risk" }[] }) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between border-b border-border py-4 last:border-0">
          <span className="text-[12px] text-muted-foreground">{item.label}</span>
          <span className={cn("text-[13px] font-semibold tabular-nums text-foreground", item.tone === "risk" && "text-destructive")}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DecisionPanel({ focusItems, isLoading, base, onNavigate }: {
  focusItems: FocusItem[];
  isLoading: boolean;
  base: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="border border-border bg-foreground text-background">
      <div className="flex items-center justify-between border-b border-background/15 p-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-background/45">Decision queue</div>
          <h2 className="mt-1 text-[18px] font-semibold">Dagens fokus</h2>
        </div>
        <Clock3 className="h-4 w-4 text-stamp" />
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-14 bg-background/10" />)}</div>
        ) : focusItems.length === 0 ? (
          <div className="border border-background/15 p-4">
            <CheckCircle2 className="h-5 w-5 text-stamp" />
            <p className="mt-3 text-[13px] leading-6 text-background/70">Ingen presserende sager lige nu. Brug tiden på pipeline, outreach eller fakturering.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {focusItems.slice(0, 5).map((item) => {
              const Icon = FOCUS_ICON[item.kind];
              const href = item.kind === "invoice" ? "finance/invoices" : item.kind === "deal" ? "crm/deals?view=board" : "crm/leads";
              const urgent = item.overdue || item.kind === "invoice";
              return (
                <li key={`${item.kind}-${item.id}`} className="border border-background/15 bg-background/[0.03] p-3">
                  <div className="flex items-start gap-3">
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center", urgent ? "bg-stamp text-stamp-foreground" : "bg-background/10 text-background")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-5 text-background/85">{focusItemText(item)}</p>
                      <button onClick={() => onNavigate(`${base}/${href}`)} className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stamp">
                        {FOCUS_CTA[item.kind]} →
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PipelinePanel({ stages, base }: { stages: { name: string; count: number; color: string }[]; base: string }) {
  return (
    <div className="border border-border bg-card">
      <PanelHeader eyebrow="Sales lane" title="Pipeline health" action="Åbn pipeline" href={`${base}/crm/deals?view=board`} />
      <div className="border-t border-border p-5">
        {stages.length > 0 ? (
          <div className="grid grid-cols-[120px_1fr] gap-5">
            <div className="h-[120px] w-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stages} dataKey="count" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={2} stroke="none">
                    {stages.map((stage) => <Cell key={stage.name} fill={stage.color} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 space-y-2">
              {stages.map((stage) => (
                <div key={stage.name} className="grid grid-cols-[1fr_34px] items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stage.color }} />
                      <span className="truncate">{stage.name}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-muted">
                      <div className="h-full" style={{ width: `${Math.max(8, stage.count * 14)}%`, maxWidth: "100%", background: stage.color }} />
                    </div>
                  </div>
                  <span className="text-right text-[13px] font-semibold tabular-nums">{stage.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyLane title="Ingen pipeline endnu" text="Opret første deal for at se salgsmomentum, stadier og pres." href={`${base}/crm/deals?create=true`} action="Opret deal" />
        )}
      </div>
    </div>
  );
}

function FlowPanel({ icon: Icon, eyebrow, title, emptyText, href, items, isLoading }: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  emptyText: string;
  href: string;
  items: { id: string; primary: string; secondary: string; tone?: "risk" }[];
  isLoading: boolean;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center border border-border bg-background text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
            <h2 className="mt-0.5 text-[15px] font-semibold">{title}</h2>
          </div>
        </div>
        <Link to={href} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-stamp">Alle</Link>
      </div>
      <div className="border-t border-border p-5">
        {isLoading ? (
          <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-[13px] leading-6 text-muted-foreground">{emptyText}</p>
        ) : (
          <ul>
            {items.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", item.tone === "risk" ? "bg-destructive" : "bg-stamp")} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">{item.primary}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{item.secondary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VelocityPanel({ leads, customers, unread, loading, base }: {
  leads: number;
  customers: number;
  unread: number;
  loading: boolean;
  base: string;
}) {
  const data = [{ label: "Leads", v: leads }, { label: "Kunder", v: customers }, { label: "Inbox", v: unread }];
  return (
    <div className="border border-border bg-card">
      <PanelHeader eyebrow="Market lane" title="Go-to-market tempo" action="Åbn leads" href={`${base}/crm/leads`} />
      <div className="grid gap-0 border-t border-border md:grid-cols-[1fr_240px]">
        <div className="h-[190px] p-5">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="market-tempo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--stamp))" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="hsl(var(--stamp))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--stamp))" strokeWidth={2} fill="url(#market-tempo)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="border-t border-border bg-background p-5 md:border-l md:border-t-0">
          <MicroStack
            items={[
              { label: "Nye leads", value: String(leads) },
              { label: "Kunder", value: String(customers) },
              { label: "Ulæste mails", value: String(unread), tone: unread > 0 ? "risk" : undefined },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function WorkforcePanel({ active, total, pending, completed, loading, base }: {
  active: number;
  total: number;
  pending: number;
  completed: number;
  loading: boolean;
  base: string;
}) {
  return (
    <div className="border border-border bg-card">
      <PanelHeader eyebrow="People lane" title="Team og eksekvering" action="Åbn HR" href={`${base}/hr/workforce`} />
      <div className="grid grid-cols-2 border-t border-border">
        <CompactNumber icon={Users} label="Aktive" value={active} loading={loading} />
        <CompactNumber icon={Users} label="Team" value={total} loading={loading} />
        <CompactNumber icon={CheckCircle2} label="Afventer" value={pending} loading={loading} tone={pending > 8 ? "risk" : undefined} />
        <CompactNumber icon={ShieldCheck} label="Lukket" value={completed} loading={loading} />
      </div>
    </div>
  );
}

function CompactNumber({ icon: Icon, label, value, loading, tone }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  loading: boolean;
  tone?: "risk";
}) {
  return (
    <div className="border-b border-r border-border p-5 even:border-r-0 last:border-b-0">
      <Icon className={cn("h-4 w-4", tone === "risk" ? "text-destructive" : "text-muted-foreground")} />
      {loading ? <Skeleton className="mt-5 h-8 w-16" /> : <div className={cn("mt-5 text-[30px] font-semibold leading-none tabular-nums", tone === "risk" && "text-destructive")}>{value}</div>}
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyLane({ title, text, href, action }: { title: string; text: string; href: string; action: string }) {
  return (
    <div className="flex min-h-[180px] flex-col justify-center border border-dashed border-border p-6">
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">{text}</p>
      <Link to={href} className="mt-4 flex w-fit items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-stamp">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
