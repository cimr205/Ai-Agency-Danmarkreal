import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const MODULE_KEYS = ['crm', 'marketing', 'finance', 'hr', 'system'] as const;
export type ModuleKey = typeof MODULE_KEYS[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  crm: 'CRM',
  marketing: 'Marketing',
  finance: 'Finans',
  hr: 'HR',
  system: 'System',
};

// Maps a route path (relative, e.g. "crm/leads") to its module key, for
// gating direct URL navigation the same way the sidebar is gated.
export function pathToModule(path: string): ModuleKey | null {
  if (path.startsWith('crm/')) return 'crm';
  if (path.startsWith('marketing/') || path === 'email/bulk' || path === 'email/templates') return 'marketing';
  if (path.startsWith('finance/')) return 'finance';
  if (path.startsWith('hr/')) return 'hr';
  if (path.startsWith('workspace/') || ['autopilot', 'pa', 'help'].includes(path) || path.startsWith('settings/')) return 'system';
  return null;
}

/**
 * The current user's own blocked modules. Always empty for admins/owners.
 *
 * While the restrictions query is still loading for a restricted user, this
 * fails closed — every module is reported blocked — rather than defaulting
 * to an empty set, which would open a brief unrestricted window on every
 * page load/refresh before the real restrictions arrive.
 */
export function useMyBlockedModules(): Set<string> {
  const { user, roles } = useAuth();
  const isUnrestricted = roles.some(r => ['system_admin', 'company_admin', 'owner'].includes(r.role));

  const query = useQuery({
    queryKey: ['module-restrictions', 'self', user?.user_id],
    enabled: !!user?.user_id && !isUnrestricted,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_restrictions')
        .select('module')
        .eq('user_id', user!.user_id);
      if (error) throw error;
      return new Set((data ?? []).map(r => r.module));
    },
  });

  if (isUnrestricted) return new Set<string>();
  if (query.data) return query.data;
  // Loading (or not yet enabled because we don't have a user id yet): fail
  // closed so gated UI stays hidden/blocked until we know for sure.
  return new Set<string>(MODULE_KEYS);
}

/** A specific employee's blocked modules — for the admin UI. */
export function useUserModuleRestrictions(userId: string | null) {
  return useQuery({
    queryKey: ['module-restrictions', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_restrictions')
        .select('module')
        .eq('user_id', userId!);
      if (error) throw error;
      return new Set((data ?? []).map(r => r.module));
    },
  });
}

export function useSetModuleRestrictions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, blockedModules }: { userId: string; blockedModules: ModuleKey[] }) => {
      if (!user?.company_id) throw new Error('No company');
      const { error: deleteError } = await supabase
        .from('module_restrictions')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;

      if (blockedModules.length > 0) {
        const { error: insertError } = await supabase
          .from('module_restrictions')
          .insert(blockedModules.map(module => ({
            company_id: user.company_id!,
            user_id: userId,
            module,
            created_by: user.user_id,
          })));
        if (insertError) throw insertError;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['module-restrictions', vars.userId] });
      qc.invalidateQueries({ queryKey: ['module-restrictions', 'self'] });
    },
  });
}
