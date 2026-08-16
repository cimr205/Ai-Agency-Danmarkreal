import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TeamMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  leadsCreated: number;
  dealsCreated: number;
  dealsWon: number;
  dealsWonValue: number;
  tasksCompleted: number;
  tasksPending: number;
}

export function useTeamPerformance() {
  return useQuery<TeamMember[]>({
    queryKey: ['team-performance'],
    queryFn: async () => {
      // Fetch all company profiles, leads, deals, tasks in parallel
      const [profilesRes, leadsRes, dealsRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, avatar_url'),
        supabase.from('leads').select('created_by'),
        supabase.from('deals').select('created_by, owner_id, stage, value'),
        supabase.from('tasks').select('assigned_to, status'),
      ]);

      const profiles = profilesRes.data ?? [];
      const leads = leadsRes.data ?? [];
      const deals = dealsRes.data ?? [];
      const tasks = tasksRes.data ?? [];

      // Only include profiles that have activity
      const activeUserIds = new Set<string>();
      leads.forEach(l => activeUserIds.add(l.created_by));
      deals.forEach(d => { if (d.created_by) activeUserIds.add(d.created_by); if (d.owner_id) activeUserIds.add(d.owner_id); });
      tasks.forEach(t => { if (t.assigned_to) activeUserIds.add(t.assigned_to); });

      const memberMap = new Map<string, TeamMember>();

      profiles.forEach(p => {
        if (!activeUserIds.has(p.user_id)) return;
        memberMap.set(p.user_id, {
          userId: p.user_id,
          name: p.full_name || 'Unavngivet',
          avatarUrl: p.avatar_url,
          leadsCreated: 0,
          dealsCreated: 0,
          dealsWon: 0,
          dealsWonValue: 0,
          tasksCompleted: 0,
          tasksPending: 0,
        });
      });

      // Also add users not in profiles but with activity
      activeUserIds.forEach(uid => {
        if (!memberMap.has(uid)) {
          memberMap.set(uid, {
            userId: uid,
            name: 'Unavngivet',
            avatarUrl: null,
            leadsCreated: 0,
            dealsCreated: 0,
            dealsWon: 0,
            dealsWonValue: 0,
            tasksCompleted: 0,
            tasksPending: 0,
          });
        }
      });

      leads.forEach(l => {
        const m = memberMap.get(l.created_by);
        if (m) m.leadsCreated++;
      });

      deals.forEach(d => {
        const uid = d.owner_id || d.created_by;
        const m = memberMap.get(uid);
        if (m) {
          m.dealsCreated++;
          if (d.stage === 'won') {
            m.dealsWon++;
            m.dealsWonValue += Number(d.value || 0);
          }
        }
      });

      tasks.forEach(t => {
        if (!t.assigned_to) return;
        const m = memberMap.get(t.assigned_to);
        if (m) {
          if (t.status === 'completed') m.tasksCompleted++;
          else m.tasksPending++;
        }
      });

      return Array.from(memberMap.values()).sort((a, b) => b.dealsWonValue - a.dealsWonValue);
    },
    staleTime: 60_000,
  });
}
