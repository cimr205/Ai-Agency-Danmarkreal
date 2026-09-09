import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// useUpdateLead lives in useLeads.ts — it's the canonical version (repointed
// to the unified customers table). Re-exported here so existing importers
// of this file don't need to change their import path.
export { useUpdateLead } from '@/hooks/api/useLeads';

export type LeadAiSummary = {
  summary: string;
  last_contact_summary: string;
  open_promises: string[];
  risk_level: 'low' | 'medium' | 'high';
  risk_reason: string;
  next_action: string;
  days_since_contact: number;
};

export function useLeadAiRecommendation() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('lead-ai-recommend', {
        body: { lead_id: leadId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as LeadAiSummary;
    },
  });
}
