import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type OutreachStatus =
  | "draft" | "ready" | "connection_sent" | "connected" | "messaged" | "replied" | "skipped";

export interface LinkedInOutreachRow {
  id: string;
  company_id: string;
  lead_gen_result_id: string | null;
  customer_id: string | null;
  contact_name: string | null;
  contact_role: string | null;
  company_name: string | null;
  linkedin_url: string;
  connection_note: string | null;
  followup_message: string | null;
  status: OutreachStatus;
  sent_at: string | null;
  connected_at: string | null;
  replied_at: string | null;
  notes: string | null;
  created_at: string;
}

const outreachTable = () => supabase.from("linkedin_outreach");

async function invokeOutreach<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("linkedin-outreach", { body });
  if (error) {
    // Edge functions return { error } with a non-2xx status; surface that message.
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().then((j: { error?: string }) => j?.error).catch(() => null) : null;
    throw new Error(detail ?? error.message);
  }
  if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export function useLinkedInOutreach() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["linkedin-outreach", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<LinkedInOutreachRow[]> => {
      const { data, error } = await outreachTable()
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinkedInOutreachRow[];
    },
  });
}

export function useLinkedInAccount() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["linkedin-account", profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 5 * 60_000,
    queryFn: () => invokeOutreach<{ connected: boolean; name?: string | null }>({ action: "account" }),
  });
}

export function useQueueLinkedInOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resultIds: string[]) =>
      invokeOutreach<{ queued: number; alreadyQueued: number; noProfile: number }>({ action: "queue-from-results", resultIds }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["linkedin-outreach"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useGenerateLinkedInDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      invokeOutreach<{ generated: number; failed: string[] }>({ action: "generate-drafts", ids }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["linkedin-outreach"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLinkedInOutreach() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LinkedInOutreachRow> }) => {
      const { error } = await outreachTable()
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", profile!.company_id!);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["linkedin-outreach"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLinkedInOutreach() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await outreachTable().delete().eq("id", id).eq("company_id", profile!.company_id!);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["linkedin-outreach"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
