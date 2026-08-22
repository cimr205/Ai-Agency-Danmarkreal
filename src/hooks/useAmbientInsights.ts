import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AmbientInsight = {
  id: string;
  kind: "risk" | "opportunity" | "suggestion" | "info";
  text: string;
  href?: string;
};

interface AmbientInsightCounts {
  overdueInvoices: number;
  stalledDeals: number;
  highValueOpenDeals: number;
  tasksDueToday: number;
  quietCustomers: number;
}

/**
 * Reads a handful of company-wide counts (computed server-side, see
 * get_ambient_insights() migration) and derives ambient insights.
 * No LLM calls — fast, deterministic, contextual.
 */
export function useAmbientInsights() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ["ambient-insights", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<AmbientInsight[]> => {
      const { data, error } = await supabase.rpc("get_ambient_insights");
      if (error) throw error;
      const counts = data as unknown as AmbientInsightCounts;

      const insights: AmbientInsight[] = [];

      if (counts.overdueInvoices > 0) {
        insights.push({
          id: "overdue-invoices",
          kind: "risk",
          text: `${counts.overdueInvoices} faktura${counts.overdueInvoices > 1 ? "er" : ""} er forfalden — overvej en venlig påmindelse.`,
          href: "finance/invoices",
        });
      }

      if (counts.stalledDeals > 0) {
        insights.push({
          id: "stalled",
          kind: "risk",
          text: `${counts.stalledDeals} deal${counts.stalledDeals > 1 ? "s" : ""} har ikke bevæget sig i 3+ uger.`,
          href: "crm/pipeline",
        });
      }

      if (counts.highValueOpenDeals > 0) {
        insights.push({
          id: "high-value",
          kind: "opportunity",
          text: `${counts.highValueOpenDeals} højværdi deal${counts.highValueOpenDeals > 1 ? "s" : ""} fortjener fokus i dag.`,
          href: "crm/deals",
        });
      }

      if (counts.tasksDueToday > 0) {
        insights.push({
          id: "due-today",
          kind: "suggestion",
          text: `${counts.tasksDueToday} opgave${counts.tasksDueToday > 1 ? "r" : ""} forfalder i dag.`,
          href: "work/tasks",
        });
      }

      if (counts.quietCustomers >= 3) {
        insights.push({
          id: "quiet",
          kind: "suggestion",
          text: `${counts.quietCustomers} klienter har været stille i 30+ dage — overvej en hilsen.`,
          href: "clients",
        });
      }

      if (insights.length === 0) {
        insights.push({
          id: "calm",
          kind: "info",
          text: "Alt er roligt. Brug øjeblikket på dybt arbejde.",
        });
      }

      return insights.slice(0, 6);
    },
  });
}
