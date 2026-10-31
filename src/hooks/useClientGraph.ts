import { useQuery } from "@tanstack/react-query";
import { getLocaleFromPath } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { t3 } from '@/lib/inlineI18n';

type EmailSummary = Pick<Tables<"emails">, "id" | "subject" | "from_address" | "from_name" | "received_at" | "snippet">;
type CalendarEventSummary = Pick<Tables<"calendar_events">, "id" | "title" | "description" | "start_time" | "end_time" | "event_type">;

export type TimelineKind = "email" | "invoice" | "payment" | "meeting" | "deal" | "activity" | "task";

const activityTypeLabels = (): Record<string, string> => ({
  call: t3("Opkald", "Call", "Anruf"),
  email_sent: t3("Email sendt", "Email sent", "E-Mail gesendet"),
  email_received: t3("Email modtaget", "Email received", "E-Mail empfangen"),
  meeting: t3("Møde", "Meeting", "Besprechung"),
  note: t3("Note", "Note", "Notiz"),
  task: t3("Opgave", "Task", "Aufgabe"),
  status_change: t3("Status ændret", "Status changed", "Status geändert"),
  deal_stage_change: t3("Deal-stadie ændret", "Deal stage changed", "Deal-Phase geändert"),
  quote_sent: t3("Tilbud sendt", "Quote sent", "Angebot gesendet"),
  quote_accepted: t3("Tilbud accepteret", "Quote accepted", "Angebot angenommen"),
  invoice_sent: t3("Faktura sendt", "Invoice sent", "Rechnung gesendet"),
  payment_received: t3("Betaling modtaget", "Payment received", "Zahlung erhalten"),
});

const dealStageLabels = (): Record<string, string> => ({
  discovery: t3("Discovery", "Discovery", "Discovery"),
  qualification: t3("Kvalificering", "Qualification", "Qualifizierung"),
  proposal: t3("Tilbud", "Proposal", "Angebot"),
  negotiation: t3("Forhandling", "Negotiation", "Verhandlung"),
  won: t3("Vundet", "Won", "Gewonnen"),
  lost: t3("Tabt", "Lost", "Verloren"),
});

const invoiceStatusLabels = (): Record<string, string> => ({
  draft: t3("Kladde", "Draft", "Entwurf"),
  sent: t3("Sendt", "Sent", "Gesendet"),
  paid: t3("Betalt", "Paid", "Bezahlt"),
  overdue: t3("Forfalden", "Overdue", "Überfällig"),
  cancelled: t3("Annulleret", "Cancelled", "Storniert"),
});

const quoteStatusLabels = (): Record<string, string> => ({
  draft: t3("Kladde", "Draft", "Entwurf"),
  sent: t3("Sendt", "Sent", "Gesendet"),
  accepted: t3("Accepteret", "Accepted", "Angenommen"),
  rejected: t3("Afvist", "Rejected", "Abgelehnt"),
  expired: t3("Udløbet", "Expired", "Abgelaufen"),
});

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
    queryKey: ["client-graph", customerId, getLocaleFromPath()],
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

      const [dealsRes, invoicesRes, quotesRes, emailsRes, calRes, activitiesRes, tasksRes] = await Promise.all([
        supabase.from("deals").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("customer_id", customerId).order("issued_at", { ascending: false }),
        supabase.from("quotes").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
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
        // Service tasks structurally linked to this customer (tasks.lead_id
        // references customers(id), so it holds customers as well as leads).
        supabase.from("tasks")
          .select("id,title,status,priority,due_date,completed_at,created_at,assigned_to,assigned_profile:profiles!tasks_assigned_to_fkey(full_name,email)")
          .eq("lead_id", customerId)
          .eq("archived", false)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (dealsRes.error) throw dealsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (quotesRes.error) throw quotesRes.error;

      const deals = dealsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const quotes = quotesRes.data ?? [];
      const emails = (emailsRes.data ?? []) as EmailSummary[];
      const meetings = (calRes.data ?? []) as CalendarEventSummary[];
      const activities = activitiesRes.data ?? [];
      const tasks = (tasksRes.data ?? []) as Array<{ id: string; title: string; status: string; priority: string | null; due_date: string | null; completed_at: string | null; created_at: string; assigned_to: string | null; assigned_profile?: { full_name: string | null; email: string } | null }>;

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
          title: e.subject || t3("(uden emne)", "(no subject)", "(kein Betreff)"),
          meta: `${t3("fra", "from", "von")} ${e.from_name || e.from_address}`,
        });
      }
      for (const q of quotes) {
        tl.push({
          id: `q:${q.id}`, kind: "invoice",
          at: q.accepted_at || q.sent_at || q.created_at,
          title: `${t3("Tilbud", "Quote", "Angebot")}: ${q.title}`,
          meta: q.accepted_at ? activityTypeLabels().quote_accepted : q.sent_at ? activityTypeLabels().quote_sent : quoteStatusLabels()[q.status] || q.status,
          amount: Number(q.total),
        });
      }
      for (const inv of invoices) {
        tl.push({
          id: `i:${inv.id}`, kind: "invoice",
          at: inv.issued_at || inv.created_at,
          title: `${t3("Faktura", "Invoice", "Rechnung")} #${inv.invoice_number}`,
          meta: invoiceStatusLabels()[inv.status] || inv.status,
          amount: Number(inv.amount),
        });
      }
      for (const p of payments) {
        if (!p.paid_at) continue;
        tl.push({
          id: `p:${p.id}`, kind: "payment",
          at: p.paid_at,
          title: t3("Betaling modtaget", "Payment received", "Zahlung erhalten"),
          amount: Number(p.amount),
        });
      }
      for (const m of meetings) {
        tl.push({
          id: `m:${m.id}`, kind: "meeting",
          at: m.start_time,
          title: m.title,
          meta: m.event_type || t3("møde", "meeting", "Besprechung"),
        });
      }
      for (const d of deals) {
        tl.push({
          id: `d:${d.id}`, kind: "deal",
          at: d.created_at,
          title: /^deal:/i.test(d.title) ? d.title : `Deal: ${d.title}`,
          meta: dealStageLabels()[d.stage] || d.stage,
          amount: Number(d.value),
        });
      }
      for (const a of activities) {
        tl.push({
          id: `a:${a.id}`, kind: "activity",
          at: a.created_at,
          title: activityTypeLabels()[a.type] || a.type,
          meta: a.body || undefined,
        });
      }
      for (const task of tasks) {
        const statusLabel = task.status === "completed" ? t3("Afsluttet", "Completed", "Abgeschlossen") : task.status === "in_progress" ? t3("I gang", "In progress", "In Arbeit") : t3("Afventer", "Pending", "Ausstehend");
        const who = task.assigned_profile?.full_name || task.assigned_profile?.email;
        tl.push({
          id: `t:${task.id}`, kind: "task",
          at: task.completed_at || task.created_at,
          title: `${t3("Opgave", "Task", "Aufgabe")}: ${task.title}`,
          meta: [statusLabel, who ? `· ${who}` : null].filter(Boolean).join(" "),
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
        deals, invoices, quotes, payments, emails, meetings, activities, tasks,
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
