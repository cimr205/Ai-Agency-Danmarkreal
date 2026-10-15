import type { ComponentType } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Briefcase, Calendar, CheckCircle2, Clock3,
  FileText, Mail, PhoneCall, ShieldCheck, Target, Users, Wallet,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { isLocale, useI18n, type Locale } from "@/lib/i18n";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard, type FocusItem } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricTile, type Tone } from "@/components/shared/MetricTile";
import { EmptyState } from "@/components/shared/EmptyState";

const FOCUS_ICON = { invoice: FileText, deal: Briefcase, lead: PhoneCall, followup: PhoneCall } as const;

function focusCta(kind: FocusItem["kind"], locale: Locale): string {
  if (kind === "invoice") return locale === "da" ? "Send rykker" : locale === "de" ? "Mahnung senden" : "Send reminder";
  if (kind === "deal") return locale === "da" ? "Følg op" : locale === "de" ? "Nachfassen" : "Follow up";
  return locale === "da" ? "Ring nu" : locale === "de" ? "Jetzt anrufen" : "Call now";
}

function focusItemText(item: FocusItem, locale: Locale): string {
  const days = item.days;
  if (item.kind === "invoice") {
    const plural = days === 1 ? "" : locale === "de" ? "e" : "s";
    const label = locale === "da"
      ? `Faktura #${item.label} er ${days} dag${days === 1 ? "" : "e"} forfalden`
      : locale === "de"
        ? `Rechnung #${item.label} ist ${days} Tag${plural} überfällig`
        : `Invoice #${item.label} is ${days} day${plural} overdue`;
    return item.company ? `${label} — ${item.company}` : label;
  }
  if (item.kind === "deal") {
    return locale === "da"
      ? `Deal "${item.label}" har stået i ${item.stage} i ${days} dag${days === 1 ? "" : "e"}`
      : locale === "de"
        ? `Deal "${item.label}" steckt seit ${days} Tag${days === 1 ? "" : "en"} in ${item.stage}`
        : `Deal "${item.label}" has been in ${item.stage} for ${days} day${days === 1 ? "" : "s"}`;
  }
  const who = item.company ? `${item.label} — ${item.company}` : item.label;
  if (item.overdue) {
    return locale === "da" ? `${who}: opfølgning er overskredet` : locale === "de" ? `${who}: Nachfassen überfällig` : `${who}: follow-up is overdue`;
  }
  return locale === "da"
    ? `${who}: ${days} dage uden kontakt`
    : locale === "de"
      ? `${who}: ${days} Tage ohne Kontakt`
      : `${who}: ${days} days without contact`;
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const { format } = useCurrency();
  const { t } = useI18n();
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "dashboard.greetingMorning" : hour < 18 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening");
  const firstName = (profile?.full_name || "").split(" ")[0] || "";
  const today = new Date().toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", {
    weekday: "long", day: "numeric", month: "short",
  });

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

  // revenueByDay (already fetched for the Cashflow chart below) comes back
  // oldest → newest, same order Sparkline expects — reuse it directly.
  const revenueSparkline = d?.revenueByDay && d.revenueByDay.length >= 2
    ? d.revenueByDay.map((r) => r.value)
    : undefined;

  const pulse: { label: string; icon: ComponentType<{ className?: string }>; href: string; value: string | null; detail: string; tone: Tone; sparkline?: number[] }[] = [
    {
      label: t("dashboard.cashCollected"), icon: Wallet, href: `${base}/finance/invoices`,
      value: isLoading ? null : format(monthValue),
      detail: momDelta !== null ? `${momDelta >= 0 ? "+" : "-"}${Math.abs(momDelta)}% ${t("dashboard.vsLastMonth")}` : t("dashboard.firstActiveMonth"),
      tone: momDelta !== null && momDelta < 0 ? "destructive" : "primary",
      sparkline: revenueSparkline,
    },
    {
      label: t("dashboard.statPipeline"), icon: Briefcase, href: `${base}/crm/deals?view=board`,
      value: isLoading ? null : format(d?.deals?.openValue ?? 0),
      detail: `${openDeals} ${t("dashboard.openOpportunitiesSuffix")}`,
      tone: "primary",
    },
    {
      label: t("dashboard.pressureLabel"), icon: AlertTriangle, href: `${base}/finance/invoices`,
      value: isLoading ? null : format(overdueValue),
      detail: `${d?.invoices?.overdue ?? 0} ${t("dashboard.overdueInvoices")}`,
      tone: overdueValue > 0 ? "destructive" : "success",
    },
    {
      label: t("dashboard.workloadLabel"), icon: CheckCircle2, href: `${base}/work/tasks`,
      value: isLoading ? null : String(activeWork),
      detail: `${tasks.length} ${t("dashboard.tasksLabel")}`,
      tone: activeWork > 8 ? "warning" : "primary",
    },
  ];

  const quickActions = [
    { icon: Target, label: t("dashboard.quickNewLead"), href: `${base}/crm/leads?create=true` },
    { icon: Briefcase, label: t("dashboard.quickNewDeal"), href: `${base}/crm/deals?create=true` },
    { icon: FileText, label: t("dashboard.quickNewInvoice"), href: `${base}/finance/invoices?create=true` },
    { icon: Calendar, label: t("nav.calendar"), href: `${base}/work/calendar?create=true` },
    { icon: Mail, label: t("nav.emails"), href: `${base}/email/emails?compose=true` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("nav.dashboard")}
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        description={t("dashboard.workspaceToday").replace("{date}", today)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((action) => (
              <Button key={action.label} variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(action.href)}>
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
          </div>
        }
      />

      {showOnboardingBanner && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t("dashboard.completeSetup")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("dashboard.completeSetupDesc")}</p>
            </div>
            <Button size="sm" onClick={() => navigate(`${base}/onboarding`)} className="gap-1.5">
              {t("dashboard.startSetup")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Needs attention */}
      <section className="space-y-3">
        <SectionHeading icon={AlertTriangle} title={t("dashboard.urgentUnread")} />
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : focusItems.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("dashboard.needsAttentionEmpty")} />
        ) : (
          <Card>
            <CardContent className="p-2">
              <ul className="divide-y divide-border">
                {focusItems.slice(0, 6).map((item) => {
                  const Icon = FOCUS_ICON[item.kind];
                  const isRisk = item.kind === "invoice" || item.overdue;
                  const href = item.kind === "invoice" ? `${base}/finance/invoices`
                    : item.kind === "deal" ? `${base}/crm/deals?view=board`
                    : `${base}/crm/leads`;
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link to={href} className="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
                        <span className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                          isRisk ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{focusItemText(item, locale)}</span>
                        <span className="shrink-0 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          {focusCta(item.kind, locale)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Business pulse */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pulse.map((item) => <MetricTile key={item.label} {...item} />)}
      </section>

      {/* Revenue + pipeline */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t("dashboard.cashflowTitle")}</CardTitle>
            <Link to={`${base}/finance/invoices`} className="text-xs font-medium text-primary hover:underline">
              {t("dashboard.viewAll")}
            </Link>
          </CardHeader>
          <CardContent>
            {d?.revenueByDay && d.revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.revenueByDay} barCategoryGap="30%">
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <RTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))", fontSize: 12 }}
                    formatter={(value: number) => [format(value), t("dashboard.revenueLabel")]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={FileText} title={t("dashboard.noRevenueYet")} hint={t("dashboard.noRevenueYetDesc")} bare />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.pipelineByStage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineStages.length > 0 ? (
              <div className="flex items-center gap-5">
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pipelineStages} dataKey="count" nameKey="name" innerRadius={34} outerRadius={52} paddingAngle={2} stroke="none">
                        {pipelineStages.map((stage) => <Cell key={stage.name} fill={stage.color} />)}
                      </Pie>
                      <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  {pipelineStages.map((stage) => (
                    <div key={stage.name}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{stage.name}</span>
                        <span className="font-semibold tabular-nums text-foreground">{stage.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(8, stage.count * 14))}%`, background: stage.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={Briefcase} title={t("dashboard.noPipelineStages")} hint={t("dashboard.noDealsYetDesc")} bare />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Today: calendar + tasks */}
      <section className="grid gap-4 md:grid-cols-2">
        <FlowCard
          icon={Calendar}
          title={t("dashboard.meetingsToday")}
          href={`${base}/work/calendar`}
          isLoading={isLoading}
          emptyText={t("dashboard.noMeetings")}
          items={meetings.map((m) => ({
            id: m.id,
            primary: m.title,
            secondary: new Date(m.start_time).toLocaleTimeString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit" }),
          }))}
        />
        <FlowCard
          icon={CheckCircle2}
          title={t("dashboard.taskQueueTitle")}
          href={`${base}/work/tasks`}
          isLoading={isLoading}
          emptyText={t("dashboard.noTasks")}
          items={tasks.map((task) => ({
            id: task.id,
            primary: task.title,
            secondary: task.due_date
              ? new Date(task.due_date).toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", { day: "numeric", month: "short" })
              : "",
            risk: task.priority === "high",
          }))}
        />
      </section>

      {/* Team */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("dashboard.teamToday")}</CardTitle>
          <Link to={`${base}/hr/workforce`} className="text-xs font-medium text-primary hover:underline">
            {t("dashboard.viewAll")}
          </Link>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TeamStat icon={Users} label={t("dashboard.activeLabel")} value={d?.employees?.active ?? 0} loading={isLoading} />
          <TeamStat icon={Users} label={t("dashboard.teamLabel")} value={d?.employees?.total ?? 0} loading={isLoading} />
          <TeamStat icon={Clock3} label={t("dashboard.pending")} value={d?.tasks?.pending ?? 0} loading={isLoading} risk={(d?.tasks?.pending ?? 0) > 8} />
          <TeamStat icon={ShieldCheck} label={t("dashboard.done")} value={d?.tasks?.completed ?? 0} loading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{title}</h2>
    </div>
  );
}

function FlowCard({
  icon: Icon, title, href, emptyText, items, isLoading,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  href: string;
  emptyText: string;
  isLoading: boolean;
  items: { id: string; primary: string; secondary: string; risk?: boolean }[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <Link to={href} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", item.risk ? "bg-destructive" : "bg-primary")} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.primary}</span>
                {item.secondary && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.secondary}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TeamStat({ icon: Icon, label, value, loading, risk }: { icon: ComponentType<{ className?: string }>; label: string; value: number; loading: boolean; risk?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Icon className={cn("h-4 w-4", risk ? "text-destructive" : "text-muted-foreground")} />
      {loading ? (
        <Skeleton className="mt-3 h-7 w-10" />
      ) : (
        <div className={cn("mt-3 text-xl font-semibold tabular-nums tracking-tight", risk ? "text-destructive" : "text-foreground")}>{value}</div>
      )}
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
    </div>
  );
}
