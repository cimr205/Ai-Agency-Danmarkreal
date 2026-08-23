import { useAuth } from "@/hooks/useAuth";
import {
  ArrowUpRight, ArrowDownRight, Plus, Briefcase, FileText,
  Calendar, CheckCircle2, Mail, Sparkles, AlertTriangle, Flame, PhoneCall,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, isLocale } from "@/lib/i18n";
import { useNavigate, useParams, Link } from "react-router-dom";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard } from "@/hooks/api/useDashboard";
import type { FocusItem } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis,
} from "recharts";

const FOCUS_ICON = { invoice: FileText, deal: Briefcase, lead: PhoneCall } as const;
const FOCUS_CTA = { invoice: "Send rykker", deal: "Følg op", lead: "Ring" } as const;

function focusItemText(item: FocusItem): string {
  if (item.kind === "invoice") {
    return `Faktura #${item.label} er ${item.days} dag${item.days === 1 ? "" : "e"} forfalden${item.company ? ` — ${item.company}` : ""}`;
  }
  if (item.kind === "deal") {
    return `Deal "${item.label}" har stået i ${item.stage} i ${item.days} dag${item.days === 1 ? "" : "e"}`;
  }
  const who = item.company ? `${item.label} hos ${item.company}` : item.label;
  return item.overdue ? `${who} — opfølgning er overskredet` : `${who} — ${item.days} dage uden kontakt`;
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${routeLocale}/app`;
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();
  const { format } = useCurrency();
  const firstName = (profile?.full_name || "").split(" ")[0] || "der";

  const today = new Date().toLocaleDateString("da-DK", {
    weekday: "long", day: "numeric", month: "short",
  }).replace(/\.$/, "");

  const revenueByDay = d?.revenueByDay;
  const trends = d?.trends;
  const todayFocus = d?.today;
  const focusItems = d?.focusItems ?? [];

  const monthValue = d?.invoices?.monthValue ?? 0;
  const lastMonthValue = d?.invoices?.lastMonthValue ?? 0;
  const momDelta = lastMonthValue > 0 ? Math.round(((monthValue - lastMonthValue) / lastMonthValue) * 100) : null;

  const pipelineStages = (d?.pipeline?.stages ?? []).filter(s => s.count > 0);

  const QUICK_ACTIONS = [
    { icon: Plus, label: "Nyt lead", href: `${base}/crm/leads?create=true` },
    { icon: Briefcase, label: "Ny deal", href: `${base}/crm/deals?create=true` },
    { icon: FileText, label: "Ny faktura", href: `${base}/finance/invoices?create=true` },
    { icon: Calendar, label: "Book møde", href: `${base}/work/calendar?create=true` },
    { icon: Mail, label: "Skriv mail", href: `${base}/email/emails?compose=true` },
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* Greeting header + quick actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
            Hej, {firstName}!
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1">
            Sådan står det til i dit workspace {today}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.href)}
              className="group inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-border bg-card hover:border-primary/40 hover:bg-primary/5 text-[12.5px] text-foreground/85 transition-colors"
            >
              <a.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showOnboardingBanner && (
        <div className="flex items-start gap-4 rounded-2xl bg-card border border-border px-5 py-4">
          <Sparkles className="h-4 w-4 text-primary mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[14px] text-foreground/90">Færdiggør opsætningen for at tage workspace i fuldt brug.</p>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">3 trin — under 2 minutter, så er CRM, fakturering og team klar.</p>
          </div>
          <button onClick={() => navigate(`${base}/onboarding`)} className="gap-1 h-8 px-3 rounded-xl text-[12px] text-primary hover:bg-primary/10 flex items-center shrink-0">
            Fortsæt <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Stat cards — money first, each with real comparison context */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Faktureret denne måned"
          value={isLoading ? null : format(monthValue)}
          delta={momDelta}
          icon={ArrowUpRight}
          href={`${base}/finance/invoices`}
          sparkline={revenueByDay?.map(r => ({ v: r.value }))}
        />
        <StatCard
          label="Udestående (forfaldent)"
          value={isLoading ? null : format(d?.invoices?.overdueValue ?? 0)}
          sub={(d?.invoices?.overdue ?? 0) > 0 ? `${d?.invoices?.overdue} faktura${(d?.invoices?.overdue ?? 0) > 1 ? "er" : ""}` : "ingen forfaldne"}
          destructive={(d?.invoices?.overdueValue ?? 0) > 0}
          icon={AlertTriangle}
          href={`${base}/finance/invoices`}
        />
        <StatCard
          label="Pipeline-værdi"
          value={isLoading ? null : format(d?.deals?.openValue ?? 0)}
          sub={`${(d?.deals?.total ?? 0) - (d?.deals?.won ?? 0) - (d?.deals?.lost ?? 0)} åbne deals`}
          icon={Briefcase}
          href={`${base}/crm/deals?view=board`}
          sparkline={trends?.deals}
        />
        <StatCard
          label="Nye leads"
          value={isLoading ? null : String(d?.leads?.newThisMonth ?? 0)}
          sub="denne måned"
          icon={Flame}
          href={`${base}/crm/leads`}
          sparkline={trends?.leads}
        />
      </div>

      {/* Revenue chart + Dagens fokus, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[13px] font-medium">Omsætning</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">Faktureret denne måned</div>
            </div>
          </div>
          <div className="min-h-[220px]">
            {revenueByDay && revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueByDay} barCategoryGap="28%">
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <RTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [format(v), "Omsætning"]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]} fill="hsl(var(--primary))" maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-[12.5px] text-muted-foreground italic">Ingen fakturerede beløb denne måned endnu.</p>
                <Link to={`${base}/finance/invoices?create=true`} className="text-[12px] text-primary hover:underline">
                  Opret faktura →
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="text-[13px] font-medium mb-1">Dagens fokus</div>
          <div className="text-[11.5px] text-muted-foreground mb-4">De sager der har mest brug for dig lige nu.</div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : focusItems.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic">Alt er fulgt op — ingen presserende sager lige nu.</p>
          ) : (
            <ul className="space-y-3">
              {focusItems.map(item => {
                const Icon = FOCUS_ICON[item.kind];
                const href = item.kind === "invoice" ? "finance/invoices" : item.kind === "deal" ? "crm/deals?view=board" : "crm/leads";
                const urgent = item.overdue || item.kind === "invoice";
                return (
                  <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3">
                    <span className={`grid place-items-center h-7 w-7 rounded-full shrink-0 mt-0.5 ${urgent ? "bg-destructive/15 text-destructive" : "bg-primary/12 text-primary"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-foreground/90 leading-snug">{focusItemText(item)}</p>
                      <button
                        onClick={() => navigate(`${base}/${href}`)}
                        className="text-[11.5px] text-primary hover:underline mt-1"
                      >
                        {FOCUS_CTA[item.kind]} →
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Pipeline breakdown + today's meetings/tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="text-[13px] font-medium mb-4">Pipeline efter fase</div>
          {pipelineStages.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="h-[110px] w-[110px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pipelineStages}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={34}
                      outerRadius={54}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {pipelineStages.map((s, i) => (
                        <Cell key={i} fill={s.color} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 min-w-0">
                {pipelineStages.map((s, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground truncate">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                    <span className="text-foreground/80 ml-auto shrink-0 tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="h-[110px] flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-[12.5px] text-muted-foreground italic">Ingen deals i pipeline endnu.</p>
              <Link to={`${base}/crm/deals?create=true`} className="text-[12px] text-primary hover:underline">
                Opret deal →
              </Link>
            </div>
          )}
        </div>
        <FlowCard
          icon={Calendar}
          label="Møder i dag"
          emptyText="Ingen møder planlagt i dag."
          href={`${base}/work/calendar`}
          items={(todayFocus?.meetings ?? []).map(m => ({
            id: m.id,
            primary: m.title,
            secondary: new Date(m.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
          }))}
        />
        <FlowCard
          icon={CheckCircle2}
          label="Opgaver der venter"
          emptyText="Alt er lukket — godt klaret."
          href={`${base}/work/tasks`}
          items={(todayFocus?.tasks ?? []).map(t => ({
            id: t.id,
            primary: t.title,
            secondary: t.due_date
              ? new Date(t.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
              : "uden frist",
            tone: t.priority === "high" ? "urgent" : undefined,
          }))}
        />
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, delta, destructive, icon: Icon, href, sparkline,
}: {
  label: string; value: string | null; sub?: string; delta?: number | null; destructive?: boolean;
  icon: React.ComponentType<{ className?: string }>; href: string;
  sparkline?: { v: number }[];
}) {
  const gradientId = `spark-${label.replace(/\s+/g, "-")}`;
  return (
    <Link
      to={href}
      className={`rounded-2xl border p-5 flex flex-col justify-between min-h-[128px] transition-colors ${
        destructive ? "bg-destructive/5 border-destructive/25 hover:border-destructive/50" : "bg-card border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className={`grid place-items-center h-8 w-8 rounded-full ${destructive ? "bg-destructive/15 text-destructive" : "bg-primary/12 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          {value === null ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <div className="flex items-baseline gap-2">
              <div className="text-[24px] font-semibold tracking-tight tabular-nums">{value}</div>
              {typeof delta === "number" && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                  {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(delta)}%
                </span>
              )}
            </div>
          )}
          {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {sparkline && sparkline.some(p => p.v > 0) && (
          <div className="h-9 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} fill={`url(#${gradientId})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Link>
  );
}

function FlowCard({
  icon: Icon, label, emptyText, items, href, isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>; label: string; emptyText: string; href: string;
  items: { id: string; primary: string; secondary: string; tone?: "urgent" }[];
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-full bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[13px] font-medium">{label}</span>
        </div>
        <Link to={href} className="text-[11px] text-muted-foreground hover:text-primary uppercase tracking-[0.1em]">
          alle →
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/70 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 4).map(it => (
            <li key={it.id} className="group flex items-baseline gap-3 py-2 border-b border-border/60 last:border-0">
              {it.tone === "urgent" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              )}
              <span className="text-[13px] text-foreground/90 truncate flex-1 group-hover:text-foreground transition-colors">{it.primary}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{it.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
