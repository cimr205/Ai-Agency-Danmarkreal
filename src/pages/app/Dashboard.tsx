import { useAuth } from "@/hooks/useAuth";
import { useActivityLogs } from "@/hooks/api/useActivityLogs";
import { useFollowUpFeed } from "@/hooks/api/useFollowUpFeed";
import {
  ArrowUpRight, Plus, Briefcase, FileText,
  Calendar, CheckCircle2, Mail, Sparkles, AlertTriangle, Flame,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { da, de, enUS } from "date-fns/locale";
import { useI18n, isLocale } from "@/lib/i18n";
import { useNavigate, useParams, Link } from "react-router-dom";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis,
} from "recharts";

const DATE_LOCALES = { da, de, en: enUS } as const;

const ACTION_LABEL: Record<string, string> = {
  company_created: "Virksomhed oprettet",
  employee_created: "Medarbejder oprettet",
  employee_joined: "Medarbejder tilsluttede sig",
  task_created: "Opgave oprettet",
  task_updated: "Opgave opdateret",
  deal_created: "Deal oprettet",
  deal_updated: "Deal opdateret",
  lead_created: "Lead oprettet",
  lead_updated: "Lead opdateret",
  invoice_created: "Faktura oprettet",
  integration_connected: "Integration forbundet",
  integration_disconnected: "Integration afbrudt",
  gmail_connected: "Gmail forbundet",
  gmail_disconnected: "Gmail afbrudt",
  campaign_published: "Kampagne udgivet",
  workflow_run: "Workflow kørt",
  workflow_test: "Workflow testet",
};

// Any action_type not covered above still needs a readable label instead of
// the raw snake_case DB value (e.g. "integration_connected" verbatim).
function humanizeActionType(actionType: string): string {
  return actionType.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const { data: recentActivity, isLoading: activityLoading } = useActivityLogs(10);
  const { data: followUps, isLoading: followUpsLoading } = useFollowUpFeed(6);
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${routeLocale}/app`;
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();
  const dateFnsLocale = DATE_LOCALES[locale] || enUS;
  const { format } = useCurrency();
  const overdueCount = d?.invoices?.overdue ?? 0;
  const firstName = (profile?.full_name || "").split(" ")[0] || "there";

  // Danish/German abbreviated months already end in a period (e.g. "aug."),
  // which would double up with the trailing "." in dashboard.workspaceToday.
  const today = new Date().toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", {
    weekday: "long", day: "numeric", month: "short",
  }).replace(/\.$/, "");

  // Revenue-by-day this month, from paid invoices — feeds the bar chart.
  const { data: revenueByDay } = useQuery({
    queryKey: ["dashboard-revenue-by-day", profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("invoices")
        .select("amount, paid_at, created_at")
        .eq("company_id", profile!.company_id)
        .gte("created_at", start.toISOString());
      const byDay = new Map<string, number>();
      (data ?? []).forEach((inv) => {
        const dt = new Date(inv.paid_at || inv.created_at);
        const key = dt.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
        byDay.set(key, (byDay.get(key) ?? 0) + Number(inv.amount || 0));
      });
      return Array.from(byDay.entries()).map(([label, value]) => ({ label, value })).slice(-8);
    },
  });

  // 14-day trend buckets for the stat card sparklines — grounded in real data.
  const { data: trends } = useQuery({
    queryKey: ["dashboard-trends", profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(); start.setDate(start.getDate() - 13); start.setHours(0, 0, 0, 0);
      const [leadsRes, dealsRes] = await Promise.all([
        supabase.from("leads").select("created_at").eq("company_id", profile!.company_id).gte("created_at", start.toISOString()),
        supabase.from("deals").select("created_at, stage, value").eq("company_id", profile!.company_id).gte("created_at", start.toISOString()),
      ]);
      const days: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i);
        days.push(dt.toISOString().slice(0, 10));
      }
      const leadsByDay = new Map(days.map(dy => [dy, 0]));
      (leadsRes.data ?? []).forEach(l => {
        const key = (l.created_at as string).slice(0, 10);
        if (leadsByDay.has(key)) leadsByDay.set(key, leadsByDay.get(key)! + 1);
      });
      const dealsByDay = new Map(days.map(dy => [dy, 0]));
      const wonByDay = new Map(days.map(dy => [dy, 0]));
      (dealsRes.data ?? []).forEach(dl => {
        const key = (dl.created_at as string).slice(0, 10);
        if (dealsByDay.has(key)) dealsByDay.set(key, dealsByDay.get(key)! + 1);
        if (dl.stage === "won" && wonByDay.has(key)) wonByDay.set(key, wonByDay.get(key)! + Number(dl.value || 0));
      });
      return {
        leads: days.map(dy => ({ v: leadsByDay.get(dy) ?? 0 })),
        deals: days.map(dy => ({ v: dealsByDay.get(dy) ?? 0 })),
        won: days.map(dy => ({ v: wonByDay.get(dy) ?? 0 })),
      };
    },
  });

  const { data: todayFocus } = useQuery({
    queryKey: ["today-focus", profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const [meetingsRes, tasksRes] = await Promise.all([
        supabase.from("calendar_events").select("id,title,start_time,end_time")
          .eq("company_id", profile!.company_id)
          .gte("start_time", start.toISOString()).lte("start_time", end.toISOString())
          .order("start_time").limit(6),
        supabase.from("tasks").select("id,title,due_date,priority")
          .eq("company_id", profile!.company_id).neq("status", "completed")
          .order("due_date", { ascending: true, nullsFirst: false }).limit(6),
      ]);
      return { meetings: meetingsRes.data ?? [], tasks: tasksRes.data ?? [] };
    },
  });

  const moments = (() => {
    if (!recentActivity) return [];
    const seen = new Set<string>();
    return recentActivity.filter(a => {
      const key = `${a.action_type}:${a.entity_id || ""}:${(a.description || "").slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const pipelineStages = (d?.pipeline?.stages ?? []).filter(s => s.count > 0);

  return (
    <div className="space-y-6 pb-16">
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
            {t('dashboard.greeting').replace('{name}', firstName)}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1">
            {t('dashboard.workspaceToday').replace('{date}', today)}
          </p>
        </div>
        <div className="flex items-center gap-2 h-9 px-4 rounded-full bg-card border border-border text-[12.5px] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {t('dashboard.thisMonth')}
        </div>
      </div>

      {showOnboardingBanner && (
        <div className="flex items-start gap-4 rounded-2xl bg-card border border-border px-5 py-4">
          <Sparkles className="h-4 w-4 text-primary mt-1 shrink-0" />
          <div className="flex-1">
            <p className="text-[14px] text-foreground/90">Færdiggør opsætningen for at tage workspace i fuldt brug.</p>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Få minutter — så er CRM, fakturering og team klar.</p>
          </div>
          <button onClick={() => navigate(`${base}/onboarding`)} className="gap-1 h-8 px-3 rounded-xl text-[12px] text-primary hover:bg-primary/10 flex items-center shrink-0">
            Fortsæt <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {overdueCount > 0 && (
        <button
          onClick={() => navigate(`${base}/finance/invoices`)}
          className="group w-full flex items-center gap-3 text-left rounded-2xl bg-destructive/10 border border-destructive/20 px-5 py-3 transition-colors hover:bg-destructive/15"
        >
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-[13.5px] text-foreground/90">
            {overdueCount} faktura{overdueCount > 1 ? "er" : ""} er forfalden.
          </span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground ml-auto">se →</span>
        </button>
      )}

      {/* Stat cards — icon badge, big number, trend accent */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.totalRevenue')}
          value={isLoading ? null : format(d?.invoices?.totalValue ?? 0)}
          icon={ArrowUpRight}
          href={`${base}/finance/invoices`}
          sparkline={revenueByDay?.map(r => ({ v: r.value }))}
        />
        <StatCard
          label={t('dashboard.totalDeals')}
          value={isLoading ? null : String(d?.deals?.total ?? 0)}
          sub={`${d?.deals?.won ?? 0} ${t('dashboard.wonSuffix')}`}
          icon={Briefcase}
          href={`${base}/crm/deals`}
          sparkline={trends?.deals}
        />
        <StatCard
          label={t('dashboard.totalLeads')}
          value={isLoading ? null : String(d?.leads?.total ?? 0)}
          sub={`${d?.leads?.new ?? 0} ${t('dashboard.new')}`}
          icon={Flame}
          href={`${base}/crm/leads`}
          sparkline={trends?.leads}
        />
        <StatCard
          label={t('dashboard.wonValue')}
          value={isLoading ? null : format(d?.deals?.wonValue ?? 0)}
          icon={CheckCircle2}
          href={`${base}/crm/deals`}
          sparkline={trends?.won}
        />
      </div>

      {/* Revenue chart + recent activity, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[13px] font-medium">{t('dashboard.revenueLabel')}</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">{t('dashboard.invoicedThisMonth')}</div>
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
                    formatter={(v: number) => [format(v), t('dashboard.revenueLabel')]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 6, 6]} fill="hsl(var(--primary))" maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] grid place-items-center text-[12.5px] text-muted-foreground italic">
                Ingen fakturerede beløb denne måned endnu.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="text-[13px] font-medium mb-4">Seneste aktivitet</div>
          {activityLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : moments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic">Ingen aktivitet endnu.</p>
          ) : (
            <ul className="space-y-3.5">
              {moments.slice(0, 6).map(a => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="grid place-items-center h-6 w-6 rounded-full bg-success/15 text-success shrink-0 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground/90 truncate">{ACTION_LABEL[a.action_type] ?? humanizeActionType(a.action_type)}</p>
                    <p className="text-[11px] text-muted-foreground mt-px">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: dateFnsLocale })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Pipeline breakdown — donut + today's focus */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="text-[13px] font-medium mb-4">{t('dashboard.pipelineByStage')}</div>
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
            <div className="h-[110px] grid place-items-center text-[12.5px] text-muted-foreground italic">
              Ingen deals i pipeline endnu.
            </div>
          )}
        </div>
        <FlowCard
          icon={Calendar}
          label="Møder i dag"
          emptyText="Ingen møder planlagt."
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
        <FlowCard
          icon={Flame}
          label="Hvem skal du tale med"
          emptyText="Ingen leads kræver opfølgning lige nu."
          href={`${base}/crm/leads`}
          items={(followUps ?? []).map(f => ({
            id: f.id,
            primary: f.company_name ? `${f.name} — ${f.company_name}` : f.name,
            secondary: f.reason,
            tone: f.overdue ? "urgent" : undefined,
          }))}
          isLoading={followUpsLoading}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { icon: Plus, label: "Nyt lead", href: `${base}/crm/leads?create=true` },
          { icon: Briefcase, label: "Ny deal", href: `${base}/crm/deals?create=true` },
          { icon: FileText, label: "Ny faktura", href: `${base}/finance/invoices?create=true` },
          { icon: Calendar, label: "Book møde", href: `${base}/work/calendar?create=true` },
          { icon: Mail, label: "Skriv mail", href: `${base}/email/emails?compose=true` },
        ].map(a => (
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
  );
}

function StatCard({
  label, value, sub, icon: Icon, href, sparkline,
}: {
  label: string; value: string | null; sub?: string; icon: React.ComponentType<{ className?: string }>; href: string;
  sparkline?: { v: number }[];
}) {
  const gradientId = `spark-${label.replace(/\s+/g, "-")}`;
  return (
    <Link to={href} className="rounded-2xl bg-card border border-border p-5 flex flex-col justify-between min-h-[128px] hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className="grid place-items-center h-8 w-8 rounded-full bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          {value === null ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <div className="text-[24px] font-semibold tracking-tight tabular-nums">{value}</div>
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
