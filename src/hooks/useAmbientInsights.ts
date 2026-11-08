import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getLocaleFromPath } from "@/lib/i18n";
import { t3 } from '@/lib/inlineI18n';

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
    queryKey: ["ambient-insights", companyId, getLocaleFromPath()],
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
          text: counts.overdueInvoices > 1
            ? t3(`${counts.overdueInvoices} fakturaer er forfaldne — overvej en venlig påmindelse.`, `${counts.overdueInvoices} invoices are overdue — consider a friendly reminder.`, `${counts.overdueInvoices} Rechnungen sind überfällig — denken Sie an eine freundliche Erinnerung.`)
            : t3("1 faktura er forfalden — overvej en venlig påmindelse.", "1 invoice is overdue — consider a friendly reminder.", "1 Rechnung ist überfällig — denken Sie an eine freundliche Erinnerung."),
          href: "finance/invoices",
        });
      }

      if (counts.stalledDeals > 0) {
        insights.push({
          id: "stalled",
          kind: "risk",
          text: t3(`${counts.stalledDeals} deal${counts.stalledDeals > 1 ? "s" : ""} har ikke bevæget sig i 3+ uger.`, `${counts.stalledDeals} deal${counts.stalledDeals > 1 ? "s haven't" : " hasn't"} moved in 3+ weeks.`, `${counts.stalledDeals} Deal${counts.stalledDeals > 1 ? "s haben" : " hat"} sich seit 3+ Wochen nicht bewegt.`),
          href: "crm/deals",
        });
      }

      if (counts.highValueOpenDeals > 0) {
        insights.push({
          id: "high-value",
          kind: "opportunity",
          text: t3(`${counts.highValueOpenDeals} højværdi-deal${counts.highValueOpenDeals > 1 ? "s fortjener" : " fortjener"} fokus i dag.`, `${counts.highValueOpenDeals} high-value deal${counts.highValueOpenDeals > 1 ? "s deserve" : " deserves"} focus today.`, `${counts.highValueOpenDeals} hochwertige${counts.highValueOpenDeals > 1 ? " Deals verdienen" : "r Deal verdient"} heute Aufmerksamkeit.`),
          href: "crm/deals",
        });
      }

      if (counts.tasksDueToday > 0) {
        insights.push({
          id: "due-today",
          kind: "suggestion",
          text: t3(`${counts.tasksDueToday} opgave${counts.tasksDueToday > 1 ? "r" : ""} forfalder i dag.`, `${counts.tasksDueToday} task${counts.tasksDueToday > 1 ? "s are" : " is"} due today.`, `${counts.tasksDueToday} Aufgabe${counts.tasksDueToday > 1 ? "n sind" : " ist"} heute fällig.`),
          href: "work/tasks",
        });
      }

      if (counts.quietCustomers >= 3) {
        insights.push({
          id: "quiet",
          kind: "suggestion",
          text: t3(`${counts.quietCustomers} kunder har været stille i 30+ dage — overvej en hilsen.`, `${counts.quietCustomers} customers have been quiet for 30+ days — consider saying hello.`, `${counts.quietCustomers} Kunden waren seit 30+ Tagen still — vielleicht ein kurzer Gruß?`),
          href: "clients",
        });
      }

      if (insights.length === 0) {
        insights.push({
          id: "calm",
          kind: "info",
          text: t3("Alt er roligt. Brug øjeblikket på dybt arbejde.", "All quiet. Use the moment for deep work.", "Alles ruhig. Nutzen Sie den Moment für konzentriertes Arbeiten."),
        });
      }

      return insights.slice(0, 6);
    },
  });
}
