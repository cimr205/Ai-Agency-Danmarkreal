import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type EmailSummary = Pick<Tables<"emails">, "id" | "subject" | "from_address" | "from_name" | "received_at" | "snippet">;
type CalendarEventSummary = Pick<Tables<"calendar_events">, "id" | "title" | "description" | "start_time" | "end_time" | "event_type">;

export type TimelineKind = "email" | "invoice" | "payment" | "meeting" | "deal" | "activity";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: string;            // ISO
  title: string;
  meta?: string;         // small secondary line
  amount?: number;
}

export function useClientGraph(customerId: string | undefined) {
  return useQuery({
    queryKey: ["client-graph", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!customerId) throw new Error("no customer id");

      const { data: customer, error: cErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!customer) throw new Error("Customer not found");

      const customerEmailLower = (customer.email || "").toLowerCase();
      const nameLike = `%${customer.name}%`;

      const [dealsRes, invoicesRes, emailsRes, calRes] = await Promise.all([
        supabase.from("deals").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("customer_id", customerId).order("issued_at", { ascending: false }),
        customerEmailLower
          ? supabase.from("emails")
              .select("id,subject,from_address,from_name,received_at,snippet")
              .or(`from_address.ilike.%${customerEmailLower}%`)
              .order("received_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as EmailSummary[], error: null }),
        supabase.from("calendar_events")
          .select("id,title,description,start_time,end_time,event_type")
          .or(`title.ilike.${nameLike},description.ilike.${nameLike}`)
          .order("start_time", { ascending: false })
          .limit(20),
      ]);

      if (dealsRes.error) throw dealsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      const deals = dealsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const emails = (emailsRes.data ?? []) as EmailSummary[];
      const meetings = (calRes.data ?? []) as CalendarEventSummary[];

      // Payments tied to this customer's invoices
      const invoiceIds = invoices.map(i => i.id);
      const paymentsRes = invoiceIds.length
        ? await supabase.from("payments").select("*").in("invoice_id", invoiceIds).order("paid_at", { ascending: false })
        : { data: [] as Tables<"payments">[], error: null };
      const payments = paymentsRes.data ?? [];

      // Build timeline
      const tl: TimelineEvent[] = [];
      for (const e of emails) {
        tl.push({
          id: `e:${e.id}`, kind: "email",
          at: e.received_at,
          title: e.subject || "(uden emne)",
          meta: `fra ${e.from_name || e.from_address}`,
        });
      }
      for (const inv of invoices) {
        tl.push({
          id: `i:${inv.id}`, kind: "invoice",
          at: inv.issued_at || inv.created_at,
          title: `Faktura #${inv.invoice_number}`,
          meta: inv.status,
          amount: Number(inv.amount),
        });
      }
      for (const p of payments) {
        if (!p.paid_at) continue;
        tl.push({
          id: `p:${p.id}`, kind: "payment",
          at: p.paid_at,
          title: "Betaling modtaget",
          amount: Number(p.amount),
        });
      }
      for (const m of meetings) {
        tl.push({
          id: `m:${m.id}`, kind: "meeting",
          at: m.start_time,
          title: m.title,
          meta: m.event_type || "møde",
        });
      }
      for (const d of deals) {
        tl.push({
          id: `d:${d.id}`, kind: "deal",
          at: d.created_at,
          title: `Deal: ${d.title}`,
          meta: d.stage,
          amount: Number(d.value),
        });
      }

      tl.sort((a, b) => +new Date(b.at) - +new Date(a.at));

      // Stats
      const openInvoices = invoices.filter(i => i.status !== "paid");
      const overdue = openInvoices.filter(i => i.due_date && new Date(i.due_date) < new Date());
      const pipelineValue = deals
        .filter(d => !["won", "lost"].includes(d.stage))
        .reduce((s, d) => s + Number(d.value || 0), 0);
      const invoicedThisYear = invoices
        .filter(i => new Date(i.issued_at || i.created_at).getFullYear() === new Date().getFullYear())
        .reduce((s, i) => s + Number(i.amount || 0), 0);
      const lastTouch = tl[0]?.at;

      return {
        customer,
        deals, invoices, payments, emails, meetings,
        timeline: tl,
        stats: {
          openDeals: deals.filter(d => !["won", "lost"].includes(d.stage)).length,
          overdueInvoices: overdue.length,
          pipelineValue,
          invoicedThisYear,
          lastTouch,
        },
      };
    },
  });
}
