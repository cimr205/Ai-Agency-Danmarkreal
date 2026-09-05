import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.updated",
  "deal.created",
  "deal.won",
  "deal.lost",
  "task.created",
  "task.completed",
  "employee.created",
  "employee.clocked_in",
  "employee.clocked_out",
  "invoice.created",
  "invoice.paid",
  "email.sent",
  "email.opened",
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export function useWebhooks() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ["webhooks", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhooks")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useWebhookLogs(webhookId?: string) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ["webhook_logs", companyId, webhookId],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("webhook_logs")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (webhookId) q = q.eq("webhook_id", webhookId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (wh: { name: string; url: string; event: string; secret_key?: string }) => {
      const { error } = await supabase.from("webhooks").insert({
        ...wh,
        company_id: profile!.company_id!,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; url?: string; event?: string; is_active?: boolean; secret_key?: string }) => {
      const { error } = await supabase.from("webhooks").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ webhookId, event, companyId }: { webhookId: string; event: string; companyId: string }) => {
      const { data, error } = await supabase.functions.invoke("webhook-dispatch", {
        body: {
          event,
          company_id: companyId,
          test_webhook_id: webhookId,
          data: {
            _test: true,
            message: "This is a test webhook payload",
            timestamp: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      return data;
    },
    // Live-verified bug (2026-09-05): webhook-dispatch genuinely updates
    // success_count/fail_count for a test delivery (same deliverWithRetry
    // path as a real event), but this mutation never invalidated the
    // webhooks list query — the row's counters stayed frozen at "0" even
    // right after a toast confirmed a real, logged 200 delivery.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

/** Fire webhooks for an event — call from anywhere in the app */
export async function fireWebhookEvent(companyId: string, event: WebhookEvent, data: Record<string, unknown>) {
  try {
    await supabase.functions.invoke("webhook-dispatch", {
      body: { event, company_id: companyId, data },
    });
  } catch (e) {
    console.warn("Webhook dispatch failed (non-blocking):", e);
  }
}
