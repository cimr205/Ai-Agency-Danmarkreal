import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PIPELINE_STAGES = [
  { key: 'discovery', name: 'Discovery', color: '#3B82F6' },
  { key: 'proposal', name: 'Proposal', color: '#F59E0B' },
  { key: 'negotiation', name: 'Negotiation', color: '#8B5CF6' },
  { key: 'won', name: 'Won', color: '#22C55E' },
  { key: 'lost', name: 'Lost', color: '#EF4444' },
] as const;

export interface DashboardData {
  leads: { total: number; new: number; qualified: number; contacted: number; newThisMonth: number };
  deals: { total: number; value: number; won: number; lost: number; wonValue: number; openValue: number };
  employees: { total: number; active: number };
  tasks: { pending: number; completed: number; inProgress: number };
  emails: { total: number; unread: number };
  pipeline: { stages: { name: string; count: number; color: string }[] };
  customers: { total: number };
  invoices: {
    total: number; paid: number; overdue: number; totalValue: number;
    overdueValue: number; monthValue: number; lastMonthValue: number;
  };
}

export interface FocusItem {
  kind: 'invoice' | 'deal' | 'lead';
  id: string;
  label: string;
  company: string | null;
  amount: number | null;
  days: number;
  stage: string | null;
  overdue: boolean;
}

export interface FollowUpItem {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  score: number | null;
  value: number | null;
  days_since_contact: number;
  overdue: boolean;
  priority: number;
  reason: string;
}

export interface DashboardSummary extends DashboardData {
  revenueByDay: { label: string; value: number }[];
  trends: { leads: { v: number }[]; deals: { v: number }[]; won: { v: number }[] };
  today: {
    meetings: { id: string; title: string; start_time: string; end_time: string }[];
    tasks: { id: string; title: string; due_date: string | null; priority: string | null }[];
  };
  followUps: FollowUpItem[];
  focusItems: FocusItem[];
}

// Everything the dashboard needs, aggregated server-side in a single RPC call
// instead of the 30+ per-table REST calls (counts, unbounded row fetches for
// client-side summing, and separate revenue/trend/followup queries) this page
// used to fire on every load — see get_dashboard_summary() migration.
export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc('get_dashboard_summary');
      if (error) throw error;

      const summary = data as unknown as DashboardSummary;
      if (!summary.pipeline?.stages?.length) {
        summary.pipeline = { stages: DEFAULT_PIPELINE_STAGES.map(s => ({ name: s.name, color: s.color, count: 0 })) };
      }
      return summary;
    },
  });
}
