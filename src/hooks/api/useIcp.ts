import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

// ─── Types ──────────────────────────────────────────────────
export type IcpProfile = {
  id: string;
  company_id: string;
  created_by: string;
  name: string;
  description: string | null;
  industry: string[];
  sub_industries: string[];
  target_countries: string[];
  target_regions: string[];
  target_cities: string[];
  min_employees: number | null;
  max_employees: number | null;
  min_revenue: number | null;
  max_revenue: number | null;
  business_types: string[];
  target_roles: string[];
  pain_points: string[];
  desired_services: string[];
  preferred_languages: string[];
  budget_level: string;
  technology_signals: string[];
  exclude_industries: string[];
  exclude_keywords: string[];
  must_have_criteria: string[];
  nice_to_have_criteria: string[];
  weight_industry: number;
  weight_location: number;
  weight_company_size: number;
  weight_role_fit: number;
  weight_pain_points: number;
  weight_budget_fit: number;
  weight_service_fit: number;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type LeadIcpScore = {
  id: string;
  company_id: string;
  lead_id: string;
  icp_profile_id: string;
  total_score: number;
  industry_score: number;
  location_score: number;
  company_size_score: number;
  role_score: number;
  pain_point_score: number;
  service_fit_score: number;
  budget_fit_score: number;
  tech_fit_score: number;
  confidence_score: number;
  match_reasons: string[];
  red_flags: string[];
  recommended_action: string | null;
  scored_at: string;
};

export type IcpProfileInput = Omit<IcpProfile, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>;

// ─── Helper ─────────────────────────────────────────────────
async function getAuthContext() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile?.company_id) throw new Error('No company');
  return { userId: session.user.id, companyId: profile.company_id, token: session.access_token };
}

// ─── ICP Profile Hooks ─────────────────────────────────────

export function useIcpProfiles() {
  return useQuery({
    queryKey: ['icp-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icp_profiles')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IcpProfile[];
    },
  });
}

export function useIcpProfile(id: string | null) {
  return useQuery({
    queryKey: ['icp-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icp_profiles')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as IcpProfile;
    },
    enabled: !!id,
  });
}

export function useCreateIcpProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IcpProfileInput) => {
      const { userId, companyId } = await getAuthContext();
      const { data, error } = await supabase
        .from('icp_profiles')
        .insert({ ...input, company_id: companyId, created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as IcpProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icp-profiles'] }),
  });
}

export function useUpdateIcpProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: Partial<IcpProfileInput> }) => {
      const { data, error } = await supabase
        .from('icp_profiles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as IcpProfile;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['icp-profiles'] });
      qc.invalidateQueries({ queryKey: ['icp-profile', id] });
    },
  });
}

export function useDeleteIcpProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('icp_profiles')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icp-profiles'] }),
  });
}

export function useSetDefaultIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { companyId } = await getAuthContext();
      // Clear existing defaults
      await supabase
        .from('icp_profiles')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true);
      // Set new default
      const { error } = await supabase
        .from('icp_profiles')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icp-profiles'] }),
  });
}

// ─── ICP Score Hooks ────────────────────────────────────────

export function useLeadIcpScores(icpProfileId: string | null) {
  return useQuery({
    queryKey: ['icp-scores', icpProfileId],
    queryFn: async () => {
      // Live-verified bug (2026-09-05): lead_icp_scores.lead_id was
      // repointed from leads(id) to customers(id) during the leads/
      // customers merge, but this embed still asked PostgREST for a
      // "leads" relationship — which no longer exists, so the query threw
      // on every call. The error was swallowed by IcpPage.tsx defaulting
      // `data` to [], so scoring silently "worked" (the edge function did
      // write real rows) while the UI permanently showed "0 leads scored"
      // with no error message. Aliasing the embed keeps the `s.leads?.*`
      // shape every caller already depends on.
      const { data, error } = await supabase
        .from('lead_icp_scores')
        .select('*, leads:customers(name, email, company_name, phone, industry, status, score)')
        .eq('icp_profile_id', icpProfileId!)
        .order('total_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (LeadIcpScore & { leads: Pick<Tables<'customers'>, 'name' | 'email' | 'company_name' | 'phone' | 'industry' | 'status' | 'score'> | null })[];
    },
    enabled: !!icpProfileId,
  });
}

export function useScoreLeadsAgainstIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (icpProfileId: string) => {
      const { token } = await getAuthContext();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/icp-score`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ icp_profile_id: icpProfileId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_, icpProfileId) => {
      qc.invalidateQueries({ queryKey: ['icp-scores', icpProfileId] });
    },
  });
}
