import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type Department = Tables<'departments'>;
export type Shift = Tables<'shifts'> & {
  department: Pick<Department, 'id' | 'name' | 'color' | 'emoji'> | null;
  assigned_employee: { id: string; full_name: string; user_id: string | null } | null;
};
export type ShiftApplication = Tables<'shift_applications'> & {
  employee: { id: string; full_name: string } | null;
  shift: Pick<Shift, 'id' | 'shift_date' | 'start_time' | 'end_time'> | null;
};

async function notify(companyId: string, userId: string, type: string, title: string, message: string, link?: string) {
  await supabase.from('notifications').insert({
    company_id: companyId, user_id: userId, type, title, message, link: link ?? null,
  });
}

// ─── Departments ────────────────────────────────────────────
export function useDepartments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['departments', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Department[];
    },
  });
}

export function useCreateDepartment() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string; emoji?: string; location_type: 'indoor' | 'outdoor' | 'both' }) => {
      if (!user?.company_id) throw new Error('No company');
      const { data, error } = await supabase.from('departments').insert({
        company_id: user.company_id,
        created_by: user.user_id,
        name: input.name,
        color: input.color,
        emoji: input.emoji || null,
        location_type: input.location_type,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; color?: string; emoji?: string; location_type?: string }) => {
      const { error } = await supabase.from('departments').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });
}

// ─── Shifts ─────────────────────────────────────────────────
export function useShifts(range: { start: string; end: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['shifts', user?.company_id, range.start, range.end],
    enabled: !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, department:departments(id,name,color,emoji), assigned_employee:employee_profiles(id,full_name,user_id)')
        .gte('shift_date', range.start)
        .lte('shift_date', range.end)
        .order('shift_date').order('start_time');
      if (error) throw error;
      return data as unknown as Shift[];
    },
  });
}

interface ShiftInput {
  shift_date: string;
  start_time: string;
  end_time: string;
  department_id: string | null;
  assigned_employee_id: string | null;
  notes?: string;
}

export function useCreateShift() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ShiftInput) => {
      if (!user?.company_id) throw new Error('No company');
      const { data, error } = await supabase.from('shifts').insert({
        company_id: user.company_id,
        created_by: user.user_id,
        shift_date: input.shift_date,
        start_time: input.start_time,
        end_time: input.end_time,
        department_id: input.department_id,
        assigned_employee_id: input.assigned_employee_id,
        status: input.assigned_employee_id ? 'assigned' : 'open',
        notes: input.notes || null,
      }).select('*, assigned_employee:employee_profiles(id,full_name,user_id)').single();
      if (error) throw error;

      const label = `${input.shift_date} ${input.start_time.slice(0, 5)}-${input.end_time.slice(0, 5)}`;
      const assignee = data?.assigned_employee as { user_id: string | null } | null;
      if (assignee?.user_id) {
        await notify(user.company_id, assignee.user_id, 'shift_added', 'Ny vagt tildelt', `Du er sat på vagt ${label}.`, '/app/hr/work-schedule');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useUpdateShift() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ShiftInput> & { id: string }) => {
      if (!user?.company_id) throw new Error('No company');
      const status = updates.assigned_employee_id !== undefined
        ? (updates.assigned_employee_id ? 'assigned' : 'open')
        : undefined;
      const { data, error } = await supabase.from('shifts')
        .update({ ...updates, ...(status ? { status } : {}) })
        .eq('id', id)
        .select('*, assigned_employee:employee_profiles(id,full_name,user_id)')
        .single();
      if (error) throw error;

      const label = `${data.shift_date} ${String(data.start_time).slice(0, 5)}-${String(data.end_time).slice(0, 5)}`;
      const assignee = data?.assigned_employee as { user_id: string | null } | null;
      if (assignee?.user_id) {
        await notify(user.company_id, assignee.user_id, 'shift_updated', 'Vagt opdateret', `Din vagt ${label} er blevet opdateret.`, '/app/hr/work-schedule');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteShift() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shift: Pick<Shift, 'id' | 'shift_date' | 'start_time' | 'end_time'> & { assigned_employee?: { user_id: string | null } | null }) => {
      const { error } = await supabase.from('shifts').delete().eq('id', shift.id);
      if (error) throw error;
      if (user?.company_id && shift.assigned_employee?.user_id) {
        const label = `${shift.shift_date} ${String(shift.start_time).slice(0, 5)}-${String(shift.end_time).slice(0, 5)}`;
        await notify(user.company_id, shift.assigned_employee.user_id, 'shift_deleted', 'Vagt slettet', `Din vagt ${label} er blevet slettet.`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── My employee profile (for applying to shifts / own hours) ──
export function useMyEmployeeProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-employee-profile', user?.user_id],
    enabled: !!user?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_profiles')
        .select('id, full_name')
        .eq('user_id', user!.user_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ─── Shift applications ─────────────────────────────────────
export function useShiftApplications(shiftId: string | null) {
  return useQuery({
    queryKey: ['shift-applications', shiftId],
    enabled: !!shiftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_applications')
        .select('*, employee:employee_profiles(id,full_name), shift:shifts(id,shift_date,start_time,end_time)')
        .eq('shift_id', shiftId!)
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ShiftApplication[];
    },
  });
}

export function useShiftApplicationsByEmployee(employeeId: string | null) {
  return useQuery({
    queryKey: ['shift-applications', 'by-employee', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_applications')
        .select('shift_id, status')
        .eq('employee_id', employeeId!);
      if (error) throw error;
      return data as { shift_id: string; status: string }[];
    },
  });
}

export function usePendingApplications() {
  const { user } = useAuth();
  const { canManageShifts } = useShiftPermissions();
  return useQuery({
    queryKey: ['pending-applications', user?.company_id],
    enabled: !!user?.company_id && canManageShifts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shift_applications')
        .select('*, employee:employee_profiles(id,full_name), shift:shifts(id,shift_date,start_time,end_time,company_id)')
        .eq('status', 'pending')
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as ShiftApplication[]).filter(a => a.shift);
    },
  });
}

export function useApplyToShift() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shiftId, employeeId, shiftLabel }: { shiftId: string; employeeId: string; shiftLabel: string }) => {
      const { error } = await supabase.from('shift_applications').insert({
        shift_id: shiftId, employee_id: employeeId,
      });
      if (error) throw error;

      if (user?.company_id) {
        // Notify managers/admins in the company. user_roles has no company_id
        // column, so scope through profiles first — otherwise this would
        // notify managers/admins of every company in the database.
        const { data: companyProfiles } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('company_id', user.company_id);
        const companyUserIds = (companyProfiles ?? []).map(p => p.user_id);
        const { data: managers } = companyUserIds.length
          ? await supabase
              .from('user_roles')
              .select('user_id')
              .in('user_id', companyUserIds)
              .in('role', ['company_admin', 'owner', 'manager'])
          : { data: [] as { user_id: string }[] };
        await Promise.all(
          (managers ?? []).map(m => notify(
            user.company_id!, m.user_id, 'application_pending',
            'Ny ansøgning til åben vagt',
            `${user.full_name || user.email} har tilbudt sig til vagten ${shiftLabel}.`,
            '/app/hr/work-schedule',
          )),
        );
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['shift-applications', vars.shiftId] });
      qc.invalidateQueries({ queryKey: ['shift-applications', 'by-employee'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
}

export function useReviewApplication() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ application, approve }: { application: ShiftApplication; approve: boolean }) => {
      if (!user?.user_id || !user.company_id) throw new Error('Not authenticated');
      const { error: appError } = await supabase.from('shift_applications')
        .update({ status: approve ? 'approved' : 'rejected', reviewed_by: user.user_id, reviewed_at: new Date().toISOString() })
        .eq('id', application.id);
      if (appError) throw appError;

      if (approve && application.shift_id) {
        const { error: shiftError } = await supabase.from('shifts')
          .update({ assigned_employee_id: application.employee_id, status: 'assigned' })
          .eq('id', application.shift_id);
        if (shiftError) throw shiftError;
      }

      const label = application.shift
        ? `${application.shift.shift_date} ${String(application.shift.start_time).slice(0, 5)}-${String(application.shift.end_time).slice(0, 5)}`
        : 'vagten';
      const { data: emp } = await supabase.from('employee_profiles').select('user_id').eq('id', application.employee_id).maybeSingle();
      if (emp?.user_id) {
        await notify(
          user.company_id, emp.user_id,
          approve ? 'application_approved' : 'application_rejected',
          approve ? 'Vagt godkendt' : 'Ansøgning afvist',
          approve ? `Din ansøgning til vagten ${label} er godkendt.` : `Din ansøgning til vagten ${label} blev afvist.`,
          '/app/hr/work-schedule',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-applications'] });
      qc.invalidateQueries({ queryKey: ['pending-applications'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Permissions ────────────────────────────────────────────
export function useShiftPermissions() {
  const { roles } = useAuth();
  const canManageShifts = roles.some(r => ['system_admin', 'company_admin', 'owner', 'manager'].includes(r.role));
  const isOwnerLevel = roles.some(r => ['system_admin', 'company_admin', 'owner'].includes(r.role));
  const canGrantPermissions = isOwnerLevel || roles.some(r => r.role === 'manager' && r.can_grant_permissions);
  return { canManageShifts, isOwnerLevel, canGrantPermissions };
}

export interface GrantablePerson {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string | null;
  can_grant_permissions: boolean;
}

export function useGrantablePeople() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['grantable-people', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: async (): Promise<GrantablePerson[]> => {
      const { data: people, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('company_id', user!.company_id);
      if (error) throw error;
      const userIds = (people ?? []).map(p => p.user_id);
      if (userIds.length === 0) return [];
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, can_grant_permissions')
        .in('user_id', userIds);
      if (rolesError) throw rolesError;
      // A user can have more than one user_roles row — always surface the
      // highest-privilege one so admins never look editable/demotable.
      const ROLE_RANK: Record<string, number> = {
        system_admin: 5, company_admin: 4, owner: 4, manager: 3, employee: 1, readonly: 1, partner: 1,
      };
      const roleByUser = new Map<string, { user_id: string; role: string; can_grant_permissions: boolean }>();
      (roles ?? []).forEach(r => {
        const existing = roleByUser.get(r.user_id);
        if (!existing || (ROLE_RANK[r.role] ?? 0) > (ROLE_RANK[existing.role] ?? 0)) {
          roleByUser.set(r.user_id, r);
        }
      });
      return (people ?? []).map(p => {
        const r = roleByUser.get(p.user_id);
        return { ...p, role: r?.role ?? null, can_grant_permissions: r?.can_grant_permissions ?? false };
      });
    },
  });
}

export function useSetManagerPermission() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isManager, canGrantPermissions }: { userId: string; isManager: boolean; canGrantPermissions: boolean }) => {
      const role = isManager ? 'manager' : 'employee';
      const { error } = await supabase
        .from('user_roles')
        .update({ role, can_grant_permissions: canGrantPermissions })
        .eq('user_id', userId);
      if (error) throw error;

      if (user?.company_id && isManager) {
        await notify(user.company_id, userId, 'permission_granted', 'Du har fået manager-tilladelser', 'Du kan nu redigere vagtplanen for din organisation.', '/app/hr/work-schedule');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grantable-people'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Hours summary ──────────────────────────────────────────
export function computeHoursByEmployee(shifts: Shift[]): { employeeId: string; name: string; hours: number }[] {
  const map = new Map<string, { name: string; hours: number }>();
  shifts.forEach(s => {
    if (!s.assigned_employee) return;
    const [sh, sm] = String(s.start_time).split(':').map(Number);
    const [eh, em] = String(s.end_time).split(':').map(Number);
    const hours = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
    const existing = map.get(s.assigned_employee.id);
    if (existing) existing.hours += hours;
    else map.set(s.assigned_employee.id, { name: s.assigned_employee.full_name, hours });
  });
  return Array.from(map.entries()).map(([employeeId, v]) => ({ employeeId, ...v }));
}
