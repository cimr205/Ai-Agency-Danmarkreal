import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { useClientGraph } from "@/hooks/useClientGraph";
import { ClientHeader } from "@/components/clients/ClientHeader";
import { ClientTimeline } from "@/components/clients/ClientTimeline";
import { ClientDeals } from "@/components/clients/ClientDeals";
import { ClientLedger } from "@/components/clients/ClientLedger";
import { ClientRelationshipBar } from "@/components/clients/ClientRelationshipBar";
import { ClientContextSidebar } from "@/components/clients/ClientContextSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { deriveClientSignals, buildAiSummary } from "@/lib/clientIntelligence";

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-5">
      {children}
    </div>
  );
}

export default function ClientView() {
  const { id } = useParams();
  const { data, isLoading, error } = useClientGraph(id);

  const intelligence = useMemo(() => {
    if (!data) return null;
    const signals = deriveClientSignals(data);
    const summary = buildAiSummary({ customer: data.customer, stats: data.stats, signals });
    const lastTouchAt = data.stats.lastTouch ? new Date(data.stats.lastTouch).getTime() : 0;
    const days = lastTouchAt ? Math.floor((Date.now() - lastTouchAt) / 86400000) : 999;
    return { signals, summary, daysSinceTouch: days };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-10">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-32 max-w-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error || !data || !intelligence) {
    return <div className="text-sm text-muted-foreground">Klienten kunne ikke indlæses.</div>;
  }

  const { customer, timeline, stats, deals, invoices, payments } = data;

  return (
    <div className="space-y-16 pb-20">
      <ClientHeader customer={customer} stats={stats} />

      <ClientRelationshipBar
        customer={customer}
        summary={intelligence.summary}
        daysSinceTouch={intelligence.daysSinceTouch}
        pipelineValue={stats.pipelineValue}
        invoicedThisYear={stats.invoicedThisYear}
        lastTouch={stats.lastTouch}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-x-16 gap-y-14">
        <section>
          <SectionLabel>Tidslinje</SectionLabel>
          <ClientTimeline events={timeline.slice(0, 60)} />
        </section>

        <aside className="lg:sticky lg:top-16 lg:self-start">
          <SectionLabel>Kontekst</SectionLabel>
          <ClientContextSidebar signals={intelligence.signals} deals={deals} />
        </aside>
      </div>

      {deals.length > 0 && (
        <section>
          <SectionLabel>Deals</SectionLabel>
          <ClientDeals deals={deals} />
        </section>
      )}

      {(invoices.length > 0 || payments.length > 0) && (
        <section>
          <SectionLabel>Økonomi</SectionLabel>
          <ClientLedger invoices={invoices} payments={payments} />
        </section>
      )}
    </div>
  );
}
