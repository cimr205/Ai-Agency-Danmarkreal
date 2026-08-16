import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AmbientInsight = {
  id: string;
  kind: "risk" | "opportunity" | "suggestion" | "info";
  text: string;
  href?: string;
};

const dayMs = 86_400_000;

/**
 * Reads a few small slices of company data and derives ambient insights.
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
    queryFn: async () => {
      const insights: AmbientInsight[] = [];
      const now = Date.now();

      const [invoicesRes, dealsRes, customersRes, tasksRes] = await Promise.all([
        supabase.from("invoices").select("id,due_date,status,amount,customer_id").eq("company_id", companyId!).neq("status", "paid").limit(200),
        supabase.from("deals").select("id,title,stage,updated_at,value,customer_id").eq("company_id", companyId!).limit(200),
        supabase.from("customers").select("id,name,updated_at").eq("company_id", companyId!).limit(200),
        supabase.from("tasks").select("id,title,status,due_date").eq("company_id", companyId!).neq("status", "completed").limit(200),
      ]);

      const invoices = invoicesRes.data ?? [];
      const deals = dealsRes.data ?? [];
      const customers = customersRes.data ?? [];
      const tasks = tasksRes.data ?? [];

      // Overdue invoices
      const overdue = invoices.filter(i => i.due_date && new Date(i.due_date).getTime() < now);
      if (overdue.length > 0) {
        insights.push({
          id: "overdue-invoices",
          kind: "risk",
          text: `${overdue.length} faktura${overdue.length > 1 ? "er" : ""} er forfalden — overvej en venlig påmindelse.`,
          href: "finance/invoices",
        });
      }

      // Stalled deals
      const stalled = deals.filter(d => {
        if (["won", "lost"].includes(d.stage)) return false;
        const upd = new Date(d.updated_at).getTime();
        return (now - upd) / dayMs > 21;
      });
      if (stalled.length > 0) {
        insights.push({
          id: "stalled",
          kind: "risk",
          text: `${stalled.length} deal${stalled.length > 1 ? "s" : ""} har ikke bevæget sig i 3+ uger.`,
          href: "crm/pipeline",
        });
      }

      // High-value pipeline highlight
      const openHigh = deals.filter(d => !["won","lost"].includes(d.stage) && Number(d.value || 0) > 50_000);
      if (openHigh.length > 0) {
        insights.push({
          id: "high-value",
          kind: "opportunity",
          text: `${openHigh.length} højværdi deal${openHigh.length > 1 ? "s" : ""} fortjener fokus i dag.`,
          href: "crm/deals",
        });
      }

      // Tasks due today
      const today = new Date().toISOString().slice(0, 10);
      const dueToday = tasks.filter(t => t.due_date && t.due_date.slice(0, 10) === today);
      if (dueToday.length > 0) {
        insights.push({
          id: "due-today",
          kind: "suggestion",
          text: `${dueToday.length} opgave${dueToday.length > 1 ? "r" : ""} forfalder i dag.`,
          href: "work/tasks",
        });
      }

      // Quiet customers
      const quiet = customers.filter(c => {
        const upd = new Date(c.updated_at).getTime();
        return (now - upd) / dayMs > 30;
      });
      if (quiet.length >= 3) {
        insights.push({
          id: "quiet",
          kind: "suggestion",
          text: `${quiet.length} klienter har været stille i 30+ dage — overvej en hilsen.`,
          href: "clients",
        });
      }

      // Calm fallback
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
