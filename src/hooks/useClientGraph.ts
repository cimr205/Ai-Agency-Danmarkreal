import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type EmailSummary = Pick<Tables<"emails">, "id" | "subject" | "from_address" | "from_name" | "received_at" | "snippet">;
type CalendarEventSummary = Pick<Tables<"calendar_events">, "id" | "title" | "description" | "start_time" | "end_time" | "event_type">;

export type TimelineKind = "email" | "invoice" | "payment" | "meeting" | "deal" | "activity";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Opkald", email_sent: "Email sendt", email_received: "Email modtaget",
  meeting: "Møde", note: "Note", task: "Opgave", status_change: "Status ændret",
  deal_stage_change: "Deal-stadie ændret", quote_sent: "Tilbud sendt",
  quote_accepted: "Tilbud accepteret", invoice_sent: "Faktura sendt",
  payment_received: "Betaling modtaget",
};

const DEAL_STAGE_LABELS: Record<string, string> = {
  discovery: "Discovery", qualification: "Kvalificering", proposal: "Tilbud",
  negotiation: "Forhandling", won: "Vundet", lost: "Tabt",
};

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
        .eq("record_type", "customer")
        .maybeSingle();
      if (cErr) throw cErr;
      if (!customer) throw new Error("Customer not found");

      const customerEmailLower = (customer.email || "").toLowerCase();
      const nameLike = `%${customer.name}%`;

      const [dealsRes, invoicesRes, emailsRes, calRes, activitiesRes, businessEventsRes] = await Promise.all([
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
        supabase.from("crm_activities")
          .select("id,type,body,created_at,next_step_at,completed_at")
          .eq("entity_type", "customer")
          .eq("entity_id", customerId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.rpc("get_business_timeline", { p_entity_type: "customer", p_entity_id: customerId, p_limit: 100 }),
      ]);

      if (dealsRes.error) throw dealsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      const deals = dealsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const emails = (emailsRes.data ?? []) as EmailSummary[];
      const meetings = (calRes.data ?? []) as CalendarEventSummary[];
      const activities = activitiesRes.data ?? [];
      const businessEvents = businessEventsRes.data ?? [];
      const eventEntityKeys = new Set(businessEvents.map((event) => `${event.event_type}:${event.entity_id ?? ""}`));
      const eventEmailIds = new Set(businessEvents.flatMap((event) => {
        const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload as Record<string, unknown>
          : null;
        return typeof payload?.email_id === "string" ? [payload.email_id] : [];
      }));

      // Payments tied to this customer's invoices
      const invoiceIds = invoices.map(i => i.id);
      const paymentsRes = invoiceIds.length
        ? await supabase.from("payments").select("*").in("invoice_id", invoiceIds).order("paid_at", { ascending: false })
        : { data: [] as Tables<"payments">[], error: null };
      const payments = paymentsRes.data ?? [];

      // Build timeline
      const tl: TimelineEvent[] = [];
      for (const e of emails) {
        if (eventEmailIds.has(e.id)) continue;
        tl.push({
          id: `e:${e.id}`, kind: "email",
          at: e.received_at,
          title: e.subject || "(uden emne)",
          meta: `fra ${e.from_name || e.from_address}`,
        });
      }
      for (const inv of invoices) {
        if (eventEntityKeys.has(`invoice.created:${inv.id}`)) continue;
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
        if (eventEntityKeys.has(`payment.received:${p.id}`)) continue;
        tl.push({
          id: `p:${p.id}`, kind: "payment",
          at: p.paid_at,
          title: "Betaling modtaget",
          amount: Number(p.amount),
        });
      }
      for (const m of meetings) {
        if (eventEntityKeys.has(`meeting.booked:${m.id}`)) continue;
        tl.push({
          id: `m:${m.id}`, kind: "meeting",
          at: m.start_time,
          title: m.title,
          meta: m.event_type || "møde",
        });
      }
      for (const d of deals) {
        if (eventEntityKeys.has(`deal.created:${d.id}`)) continue;
        tl.push({
          id: `d:${d.id}`, kind: "deal",
          at: d.created_at,
          title: `Deal: ${d.title}`,
          meta: DEAL_STAGE_LABELS[d.stage] || d.stage,
          amount: Number(d.value),
        });
      }
      for (const a of activities) {
        tl.push({
          id: `a:${a.id}`, kind: "activity",
          at: a.created_at,
          title: ACTIVITY_TYPE_LABELS[a.type] || a.type,
          meta: a.body || undefined,
        });
      }
      for (const event of businessEvents) {
        tl.push({
          id: `event:${event.id}`,
          kind: event.event_type.startsWith("email.") ? "email"
            : event.event_type.startsWith("invoice.") ? "invoice"
            : event.event_type.startsWith("payment.") ? "payment"
            : event.event_type.startsWith("meeting.") ? "meeting"
            : event.event_type.startsWith("deal.") ? "deal" : "activity",
          at: event.occurred_at,
          title: event.event_type.split(".").join(" "),
          meta: event.source,
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
        deals, invoices, payments, emails, meetings, activities,
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
