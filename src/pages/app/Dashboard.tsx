import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import { format as formatDate } from "date-fns";
import { da } from "date-fns/locale";
import { CreateMenu } from "@/components/dashboard/CreateMenu";
import { Briefing } from "@/components/dashboard/Briefing";
import { MetricsRow, type Metric } from "@/components/dashboard/MetricsRow";
import { PipelineInsight } from "@/components/dashboard/PipelineInsight";
import { MeetingsPanel, TasksPanel } from "@/components/dashboard/AgendaPanel";

function greetingForHour(hour: number): string {
  if (hour < 6) return "Godaften";
  if (hour < 10) return "Godmorgen";
  if (hour < 18) return "God eftermiddag";
  return "Godaften";
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${routeLocale}/app`;
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();
  const { format } = useCurrency();
  const firstName = (profile?.full_name || "").split(" ")[0] || "der";

  const now = new Date();
  const dateLabel = formatDate(now, "EEEE d. MMMM", { locale: da });
  const dateLabelCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  const focusItems = d?.focusItems ?? [];
  const meetings = d?.today?.meetings ?? [];
  const tasks = d?.today?.tasks ?? [];

  const nextMeetingLine = meetings.length > 0
    ? `Næste møde er kl. ${formatDate(new Date(meetings[0].start_time), "HH:mm")}.`
    : tasks.length > 0
      ? `${tasks.length} opgave${tasks.length === 1 ? "" : "r"} venter, ingen møder i dag.`
      : "Ingen møder eller opgaver i dag.";

  const headerLine = focusItems.length > 0
    ? `Du har ${focusItems.length === 1 ? "én" : focusItems.length} ${focusItems.length === 1 ? "ting" : "ting"}, der kræver opmærksomhed i dag.`
    : `Alt vigtigt er fulgt op. ${nextMeetingLine}`;

  const monthValue = d?.invoices?.monthValue ?? 0;
  const lastMonthValue = d?.invoices?.lastMonthValue ?? 0;
  const momDelta = lastMonthValue > 0 ? Math.round(((monthValue - lastMonthValue) / lastMonthValue) * 100) : null;
  const overdueCount = d?.invoices?.overdue ?? 0;
  const openDealsCount = (d?.deals?.total ?? 0) - (d?.deals?.won ?? 0) - (d?.deals?.lost ?? 0);

  const metrics: Metric[] = [
    {
      label: "Faktureret denne måned",
      value: isLoading ? null : format(monthValue),
      delta: momDelta,
      href: `${base}/finance/invoices`,
      sparkline: d?.revenueByDay?.map((r) => ({ v: r.value })),
    },
    {
      label: "Udestående",
      value: isLoading ? null : format(d?.invoices?.overdueValue ?? 0),
      sub: overdueCount > 0 ? `${overdueCount} faktura${overdueCount > 1 ? "er" : ""} forfaldet` : "Ingen forfaldne",
      destructive: overdueCount > 0,
      href: `${base}/finance/invoices`,
    },
    {
      label: "Aktiv pipeline",
      value: isLoading ? null : format(d?.deals?.openValue ?? 0),
      sub: `${openDealsCount} åbne deals`,
      href: `${base}/crm/deals?view=board`,
    },
    {
      label: "Nye leads",
      value: isLoading ? null : String(d?.leads?.newThisMonth ?? 0),
      sub: "Denne måned",
      href: `${base}/crm/leads`,
    },
  ];

  return (
    <div className="space-y-10 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">{dateLabelCapitalized}</p>
          <h1 className="mt-1 font-serif text-[32px] leading-none text-foreground sm:text-[38px]">
            {greetingForHour(now.getHours())}, {firstName}
          </h1>
          <p className="mt-2.5 text-[14px] text-muted-foreground">{isLoading ? "Henter dagens overblik…" : headerLine}</p>
        </div>
        <CreateMenu base={base} />
      </div>

      {showOnboardingBanner && (
        <div className="flex flex-wrap items-center gap-4 rounded-[6px] border-l-2 border-primary bg-muted/40 px-5 py-4">
          <div className="flex-1">
            <p className="text-[13.5px] text-foreground">Færdiggør opsætningen for at tage din virksomhed i fuldt brug.</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">3 trin — under 2 minutter, så er CRM, fakturering og team klar.</p>
          </div>
          <button onClick={() => navigate(`${base}/onboarding`)} className="shrink-0 text-[12.5px] font-medium text-primary hover:underline">
            Fortsæt opsætning →
          </button>
        </div>
      )}

      <Briefing
        items={focusItems}
        isLoading={isLoading}
        base={base}
        emptyContext={nextMeetingLine}
        onNavigate={navigate}
      />

      <MetricsRow metrics={metrics} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <PipelineInsight
          stages={d?.pipeline?.stages ?? []}
          isLoading={isLoading}
          base={base}
          format={format}
        />
        <div className="space-y-8">
          <MeetingsPanel meetings={meetings} isLoading={isLoading} base={base} />
          <TasksPanel tasks={tasks} isLoading={isLoading} base={base} />
        </div>
      </div>
    </div>
  );
}
