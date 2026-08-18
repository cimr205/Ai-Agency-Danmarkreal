import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────
export type SessionStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type LeadGenSession = {
  id: string;
  company_id?: string;
  query: string;
  filters: Record<string, unknown>;
  status: SessionStatus;
  progress: number;
  progress_label: string | null;
  results_count: number;
  error_message: string | null;
  created_at: string;
  completed_at?: string | null;
};

export type LeadGenResult = {
  id: string;
  session_id: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  email: string | null;
  business_email: string | null;
  email_status: "verified" | "likely_valid" | "unverified" | "catch_all" | "missing";
  email_type: "personal" | "generic" | "missing" | "unknown";
  email_confidence: number;
  domain_confidence: number;
  validation_status: "valid" | "risky" | "invalid" | "unknown";
  source_page: string | null;
  source_list: string[];
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  niche: string | null;
  active_status: "active_likely" | "uncertain" | "inactive_likely";
  lead_score: number;
  imported: boolean;
  created_at: string;
  scraped_at?: string | null;
  contact_person_name: string | null;
  contact_role: string | null;
  linkedin_url: string | null;
  company_linkedin: string | null;
  google_maps_url: string | null;
  review_count: number;
  rating: number | null;
  technologies_detected: string[] | null;
};

export type SessionWithResults = LeadGenSession & {
  results: LeadGenResult[];
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  filters: Record<string, unknown>;
  created_at: string;
};

export type SessionFilters = {
  min_leads?: number;
  city?: string;
  country?: string;
  niche?: string;
  must_have_email?: boolean;
  must_have_phone?: boolean;
  must_have_website?: boolean;
  score_threshold?: number;
  exclude_keywords?: string;
};

export type CreateSessionPayload = {
  query: string;
  filters: SessionFilters;
};

// ─── API caller ─────────────────────────────────────────────
async function callLeadGenApi<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  // Use Supabase edge function as default, can be overridden
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-gen-api`;
  const url = `${baseUrl}/${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

// Normalize result to handle both old and new backend formats
type RawLeadGenResult = Partial<LeadGenResult> & Record<string, unknown> & { source_url?: string };
function normalizeResult(r: RawLeadGenResult): LeadGenResult {
  return {
    ...r,
    id: r.id || crypto.randomUUID(),
    session_id: r.session_id || '',
    company_name: r.company_name || '',
    website: r.website || null,
    phone: r.phone || null,
    city: r.city || null,
    active_status: r.active_status || "uncertain",
    lead_score: r.lead_score || 0,
    imported: r.imported || false,
    created_at: r.created_at || new Date().toISOString(),
    email: r.email || r.business_email || null,
    business_email: r.business_email || r.email || null,
    email_status: r.email_status || "missing",
    email_type: r.email_type || "unknown",
    email_confidence: r.email_confidence || 0,
    domain_confidence: r.domain_confidence || 0,
    validation_status: r.validation_status || "unknown",
    source_page: r.source_page || r.source_url || null,
    source_list: r.source_list || [],
    address: r.address || null,
    country: r.country || null,
    niche: r.niche || null,
    domain: r.domain || null,
    scraped_at: r.scraped_at || null,
    contact_person_name: r.contact_person_name || null,
    contact_role: r.contact_role || null,
    linkedin_url: r.linkedin_url || null,
    company_linkedin: r.company_linkedin || null,
    google_maps_url: r.google_maps_url || null,
    review_count: r.review_count || 0,
    rating: r.rating || null,
    technologies_detected: r.technologies_detected || null,
  };
}

// ─── Hooks ──────────────────────────────────────────────────

/** List all sessions */
export function useLeadGenSessions() {
  return useQuery({
    queryKey: ["leadgen-sessions"],
    queryFn: async () => {
      const resp = await callLeadGenApi<{ data: { sessions: LeadGenSession[]; total?: number } }>("GET", "sessions");
      return resp.data.sessions;
    },
    refetchInterval: 30_000,
  });
}

/** Get a single session with results, polls while running */
export function useLeadGenSession(sessionId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["leadgen-session", sessionId],
    queryFn: async () => {
      const resp = await callLeadGenApi<{ data: { session: LeadGenSession; results: RawLeadGenResult[] } }>(
        "GET",
        `sessions/${sessionId}`
      );
      return {
        ...resp.data.session,
        results: (resp.data.results || []).map(normalizeResult),
      } as SessionWithResults;
    },
    enabled: !!sessionId && enabled,
  });

  // Poll manually via a plain interval + refetch(), rather than react-query's
  // function-based `refetchInterval` — that stopped re-firing after the first
  // successful fetch in this app (observed: exactly one GET per session,
  // never again, even minutes later), leaving the progress UI frozen while
  // the backend kept working and completing normally.
  const status = query.data?.status;
  const isTerminal = status === "done" || status === "failed" || status === "cancelled";
  const shouldPoll = enabled && !!sessionId && !isTerminal;

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      query.refetch();
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll, sessionId]);

  return query;
}

/** Start a new scrape session */
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSessionPayload) => {
      const resp = await callLeadGenApi<{ data: { session: LeadGenSession } }>(
        "POST",
        "sessions",
        payload
      );
      return resp.data.session;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leadgen-sessions"] }),
  });
}

/** Cancel a running session */
export function useCancelSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      callLeadGenApi<void>("POST", `sessions/${sessionId}/cancel`),
    onSuccess: (_, sessionId) => {
      qc.invalidateQueries({ queryKey: ["leadgen-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["leadgen-sessions"] });
    },
  });
}

/** Delete a session */
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      callLeadGenApi<void>("DELETE", `sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leadgen-sessions"] }),
  });
}

/** Import selected results as CRM leads */
export function useImportResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, resultIds, folderId }: { sessionId: string; resultIds: string[]; folderId?: string }) =>
      callLeadGenApi<{ imported_count?: number; data?: { imported: number; failed?: string[] } }>("POST", `sessions/${sessionId}/import`, {
        result_ids: resultIds,
        ...(folderId ? { folder_id: folderId } : {}),
      }),
    onSuccess: (_, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["leadgen-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** List saved searches */
export function useSavedSearches() {
  return useQuery({
    queryKey: ["leadgen-saved"],
    queryFn: async () => {
      const resp = await callLeadGenApi<{ data: { searches: SavedSearch[] } }>("GET", "saved");
      return resp.data.searches;
    },
  });
}

/** Save a search */
export function useSaveSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; query: string; filters: Record<string, unknown> }) =>
      callLeadGenApi<SavedSearch>("POST", "saved", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leadgen-saved"] }),
  });
}

/** Delete a saved search */
export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callLeadGenApi<void>("DELETE", `saved/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leadgen-saved"] }),
  });
}
