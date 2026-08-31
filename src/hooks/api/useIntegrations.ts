import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Integration {
  id: string;
  company_id: string;
  provider: string;
  status: "connected" | "disconnected" | "pending" | "error";
  account_label: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  connected_at: string | null;
  last_sync_at: string | null;
}

export function useIntegrations() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["integrations", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<Integration[]> => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
  });
}

export function useConnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gmail-auth");
      if (error) throw error;
      const url = (data as { auth_url?: string } | null)?.auth_url;
      if (!url) throw new Error("Ingen auth URL");
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke starte Gmail-flow"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("integrations")
        .update({ status: "disconnected", last_sync_at: null })
        .eq("id", id)
        .eq("company_id", profile!.company_id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Forbindelse afbrudt");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke afbryde"),
  });
}

/**
 * Open-source webhook bridge: connect any external service (Zapier/Make/n8n
 * catch hook, or your own self-hosted endpoint) without OAuth or API keys.
 * Works with any service that can receive an HTTPS POST.
 */
export function useConnectWebhook() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { provider: string; name: string; webhookUrl: string; accountLabel?: string }) => {
      if (!profile?.company_id) throw new Error("Ingen virksomhed tilknyttet");
      try { new URL(input.webhookUrl); } catch { throw new Error("Ugyldig webhook URL"); }

      // Upsert integration row
      const { data: existing } = await supabase
        .from("integrations")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("provider", input.provider)
        .maybeSingle();

      const payload = {
        company_id: profile.company_id,
        provider: input.provider,
        status: "connected" as const,
        account_label: input.accountLabel ?? input.name,
        scopes: ["webhook:dispatch"],
        metadata: { mode: "webhook", webhook_url: input.webhookUrl },
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from("integrations").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert(payload);
        if (error) throw error;
      }

      // Mirror to webhooks table so workflow-runner / webhook-dispatch can fire it
      const event = `integration.${input.provider}`;
      const { data: wh } = await supabase
        .from("webhooks")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("event", event)
        .maybeSingle();

      if (wh?.id) {
        await supabase.from("webhooks").update({ url: input.webhookUrl, is_active: true, name: input.name }).eq("id", wh.id);
      } else {
        await supabase.from("webhooks").insert({
          company_id: profile.company_id,
          name: input.name,
          url: input.webhookUrl,
          event,
          is_active: true,
        });
      }
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.name} forbundet`);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke forbinde"),
  });
}

/**
 * Test-fire a connection's webhook with a sample payload.
 */
export function useTestConnection() {
  return useMutation({
    mutationFn: async (integration: Integration) => {
      const url = (integration.metadata as { webhook_url?: string })?.webhook_url;
      if (!url) throw new Error("Ingen webhook URL gemt");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "lovable-workspace",
          provider: integration.provider,
          event: "test.ping",
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => null);
      if (!res || !res.ok) throw new Error(`Webhook svarede ikke OK${res ? ` (${res.status})` : ""}`);
    },
    onSuccess: () => toast.success("Webhook svarede 200 — forbindelsen virker"),
    onError: (e: Error) => toast.error(e?.message ?? "Test fejlede"),
  });
}

// ─── Composio-backed connections (real OAuth, not webhook URLs) ───
// All Composio traffic goes through the composio-integration edge
// function — the platform API key never reaches the browser.

async function callComposioIntegration<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("composio-integration", { body: { action, ...body } });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let message = error.message;
    try {
      const parsed = (await ctx?.json?.()) as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch {
      // ignore, fall back to error.message
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface ComposioToolkit {
  name: string;
  slug: string;
  meta?: { description?: string; tools_count?: number; logo?: string };
  composio_managed_auth_schemes?: string[];
}

export function useComposioToolkits() {
  return useQuery({
    queryKey: ["composio-toolkits"],
    queryFn: () => callComposioIntegration<{ toolkits: ComposioToolkit[] }>("list-toolkits"),
    staleTime: 10 * 60_000,
  });
}

export function useCreateComposioConnection() {
  return useMutation({
    mutationFn: (toolkit: string) =>
      callComposioIntegration<{ redirectUrl: string; connectionId: string }>("create-connection", { toolkit }),
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke starte forbindelse"),
  });
}

export function useSyncComposioConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      callComposioIntegration<{ status: string }>("sync-connection-status", { connectionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDisconnectComposioConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => callComposioIntegration("disconnect-connection", { integrationId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Forbindelse afbrudt");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke afbryde forbindelsen"),
  });
}

// ─── Capability Engine (frontend) ───

export interface ModuleAvailability {
  module: string;
  available: boolean;
  requiredCapabilities: string[];
  resolvedConnections: Array<{ capability: string; connectionId: string; provider: string }>;
}

export function useModuleAvailability() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["module-availability", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: () => callComposioIntegration<{ modules: ModuleAvailability[] }>("module-availability"),
    staleTime: 30_000,
  });
}

export interface DocumentItem {
  id: string;
  title: string;
  url: string | null;
  lastEditedAt: string | null;
  icon: string | null;
}

export function useDocuments(enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["module-documents", profile?.company_id],
    enabled: enabled && !!profile?.company_id,
    queryFn: () => callComposioIntegration<{ provider: string; connectionId: string; documents: DocumentItem[] }>("list-documents"),
    staleTime: 60_000,
  });
}
