import { useAuth } from "@/hooks/useAuth";
import { useActivityLogs } from "@/hooks/api/useActivityLogs";
import { useFollowUpFeed } from "@/hooks/api/useFollowUpFeed";
import {
  ArrowUpRight, Plus, Briefcase, FileText, Target,
  Calendar, CheckCircle2, Mail, Users, Sparkles, AlertTriangle, Flame,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { da, de, enUS } from "date-fns/locale";
import { useI18n, isLocale } from "@/lib/i18n";
import { useNavigate, useParams, Link } from "react-router-dom";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard } from "@/hooks/api/useDashboard";
import type { FollowUpItem } from "@/hooks/api/useFollowUpFeed";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis,
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
};

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const { data: recentActivity, isLoading: activityLoading } = useActivityLogs(10);
  const { data: followUps, isLoading: followUpsLoading } = useFollowUpFeed(6);
  const { locale } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${routeLocale}/app`;
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();
  const dateFnsLocale = DATE_LOCALES[locale] || enUS;
  const { format } = useCurrency();
  const overdueCount = d?.invoices?.overdue ?? 0;
  const firstName = (profile?.full_name || "").split(" ")[0] || "there";

  const today = new Date().toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", {
    weekday: "long", day: "numeric", month: "short",
  });

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
          <h1 className="text-[26px] font-semibold tracking-tight flex items-center gap-2">
            Hello, {firstName}! <span className="inline-block">👋</span>
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1">
            This is what's happening in your workspace {today}.
          </p>
        </div>
        <div className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-card border border-border/60 text-[13px] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          This month
        </div>
      </div>

      {showOnboardingBanner && (
        <div className="flex items-start gap-4 rounded-2xl bg-card border border-border/60 px-5 py-4">
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

      {/* Stat grid + revenue chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 grid grid-cols-2 gap-5">
          <StatCard
            featured
            label="Total revenue"
            value={isLoading ? null : format(d?.invoices?.totalValue ?? 0)}
            icon={ArrowUpRight}
            href={`${base}/finance/invoices`}
          />
          <StatCard
            label="Total deals"
            value={isLoading ? null : String(d?.deals?.total ?? 0)}
            sub={`${d?.deals?.won ?? 0} won`}
            icon={Briefcase}
            href={`${base}/crm/deals`}
          />
          <StatCard
            label="Total leads"
            value={isLoading ? null : String(d?.leads?.total ?? 0)}
            sub={`${d?.leads?.new ?? 0} new`}
            icon={Target}
            href={`${base}/crm/leads`}
          />
          <StatCard
            label="Won value"
            value={isLoading ? null : format(d?.deals?.wonValue ?? 0)}
            icon={CheckCircle2}
            href={`${base}/crm/deals`}
          />
        </div>

        <div className="lg:col-span-7 rounded-3xl bg-card border border-border/60 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium">Revenue</div>
              <div className="text-[11.5px] text-muted-foreground">Invoiced this month</div>
            </div>
          </div>
          <div className="flex-1 min-h-[220px]">
            {revenueByDay && revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
                    formatter={(v: number) => [format(v), "Revenue"]}
                  />
                  <Bar dataKey="value" radius={[8, 8, 8, 8]} fill="hsl(var(--primary))" maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-[12.5px] text-muted-foreground italic">
                Ingen fakturerede beløb denne måned endnu.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary row: task/email pulse cards + pipeline donut */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <PulseCard
          value={d?.tasks?.pending ?? 0}
          label="tasks"
          detail={`${d?.tasks?.inProgress ?? 0} in progress`}
          href={`${base}/work/tasks`}
        />
        <PulseCard
          value={d?.emails?.unread ?? 0}
          label="unread emails"
          detail={`of ${d?.emails?.total ?? 0} total`}
          href={`${base}/email/emails`}
        />

        <div className="rounded-3xl bg-card border border-border/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-medium">Pipeline by stage</div>
          </div>
          {pipelineStages.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="h-[130px] w-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pipelineStages}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
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
              <ul className="space-y-2 min-w-0">
                {pipelineStages.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                    <span className="text-foreground/80 ml-auto shrink-0">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="h-[130px] grid place-items-center text-[12.5px] text-muted-foreground italic">
              Ingen deals i pipeline endnu.
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions base={base} navigate={navigate} />

      {/* Today — meetings + urgent tasks side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TodayList
          label="Møder i dag"
          icon={Calendar}
          emptyText="Ingen møder planlagt."
          href={`${base}/work/calendar`}
          items={(todayFocus?.meetings ?? []).map(m => ({
            id: m.id,
            primary: m.title,
            secondary: new Date(m.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
          }))}
        />
        <TodayList
          label="Opgaver der venter"
          icon={CheckCircle2}
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

      {/* Who to talk to today */}
      <FollowUpFeed base={base} items={followUps ?? []} isLoading={followUpsLoading} />

      {/* Moments stream */}
      <section className="rounded-3xl bg-card border border-border/60 p-6">
        <div className="flex items-baseline justify-between mb-5">
          <div className="text-[13px] font-medium">Seneste øjeblikke</div>
          <Link to={`${base}/dashboard`} className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-[0.1em]">
            historik →
          </Link>
        </div>

        {activityLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full max-w-md" />)}
          </div>
        ) : moments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground italic">Ingen aktivitet endnu — workspacet er stille.</p>
        ) : (
          <ul className="space-y-3 max-w-3xl">
            {moments.map(a => (
              <li key={a.id} className="group flex items-baseline gap-4 text-[13.5px] leading-relaxed">
                <span className="text-muted-foreground/60 text-[10px] tabular-nums w-20 shrink-0">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: false, locale: dateFnsLocale })}
                </span>
                <span className="text-foreground/85 shrink-0">{ACTION_LABEL[a.action_type] ?? a.action_type}</span>
                {a.description && <span className="text-muted-foreground truncate">— {a.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FollowUpFeed({
  base, items, isLoading,
}: { base: string; items: FollowUpItem[]; isLoading: boolean }) {
  return (
    <section className="rounded-3xl bg-card border border-border/60 p-6">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div className="text-[15px] font-medium">Hvem skal du tale med i dag</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            Prioriteret efter inaktivitet, overskredet opfølgning og dealværdi
          </div>
        </div>
        <Link to={`${base}/crm/leads`} className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-[0.1em] shrink-0">
          alle leads →
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground italic">Ingen leads kræver opfølgning lige nu.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                to={`${base}/crm/leads?leadId=${it.id}`}
                className="group flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors"
              >
                {it.overdue ? (
                  <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-foreground/90 truncate group-hover:text-foreground transition-colors">
                    {it.name}
                    {it.company_name && <span className="text-muted-foreground"> — {it.company_name}</span>}
                  </div>
                </div>
                {it.value ? (
                  <span className="text-[11.5px] tabular-nums text-muted-foreground shrink-0">
                    {Number(it.value).toLocaleString("da-DK")} kr
                  </span>
                ) : null}
                <span className={`text-[11px] shrink-0 ${it.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                  {it.reason}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function StatCard({
  label, value, sub, icon: Icon, href, featured,
}: { label: string; value: string | null; sub?: string; icon: React.ComponentType<{ className?: string }>; href: string; featured?: boolean }) {
  return (
    <Link
      to={href}
      className={
        featured
          ? "rounded-3xl bg-white text-black p-5 flex flex-col justify-between min-h-[140px] hover:opacity-95 transition-opacity"
          : "rounded-3xl bg-card border border-border/60 p-5 flex flex-col justify-between min-h-[140px] hover:border-border transition-colors"
      }
    >
      <div className="flex items-center justify-between">
        <span className={featured ? "text-[12.5px] text-black/60" : "text-[12.5px] text-muted-foreground"}>{label}</span>
        <span className={
          featured
            ? "grid place-items-center h-7 w-7 rounded-full bg-primary text-white"
            : "grid place-items-center h-7 w-7 rounded-full bg-muted text-muted-foreground"
        }>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div>
        {value === null ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-[24px] font-semibold tracking-tight tabular-nums">{value}</div>
        )}
        {sub && <div className={featured ? "text-[11.5px] text-black/50 mt-0.5" : "text-[11.5px] text-muted-foreground mt-0.5"}>{sub}</div>}
      </div>
    </Link>
  );
}

function PulseCard({
  value, label, detail, href,
}: { value: number; label: string; detail: string; href: string }) {
  return (
    <Link to={href} className="rounded-3xl bg-card border border-border/60 p-6 flex flex-col justify-between hover:border-border transition-colors">
      <span className="grid place-items-center h-9 w-9 rounded-full bg-muted text-muted-foreground mb-6">
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div>
        <div className="text-[28px] font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="text-[13px] text-muted-foreground mt-1">{label}</div>
        <div className="text-[11.5px] text-muted-foreground/70 mt-2">{detail}</div>
      </div>
    </Link>
  );
}

function QuickActions({ base, navigate }: { base: string; navigate: (p: string) => void }) {
  const actions = [
    { icon: Plus, label: "Nyt lead", href: `${base}/crm/leads?create=true` },
    { icon: Briefcase, label: "Ny deal", href: `${base}/crm/deals?create=true` },
    { icon: FileText, label: "Ny faktura", href: `${base}/finance/invoices?create=true` },
    { icon: Calendar, label: "Book møde", href: `${base}/work/calendar?create=true` },
    { icon: Mail, label: "Skriv mail", href: `${base}/email/emails?compose=true` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(a => (
        <button
          key={a.label}
          onClick={() => navigate(a.href)}
          className="group inline-flex items-center gap-2 h-9 px-3.5 rounded-2xl border border-border/60 bg-card hover:border-border text-[12.5px] text-foreground/85 transition-colors"
        >
          <a.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function TodayList({
  label, icon: Icon, emptyText, items, href,
}: {
  label: string; icon: React.ComponentType<{ className?: string }>; emptyText: string; href: string;
  items: { id: string; primary: string; secondary: string; tone?: "urgent" }[];
}) {
  return (
    <section className="rounded-3xl bg-card border border-border/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">{label}</span>
        </div>
        <Link to={href} className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-[0.1em]">
          alle →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground italic">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(it => (
            <li key={it.id} className="group flex items-baseline gap-3 text-[13.5px] py-1 border-b border-border/40 last:border-0">
              {it.tone === "urgent" && <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />}
              <span className="text-foreground/90 truncate flex-1 group-hover:text-foreground transition-colors">{it.primary}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{it.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
