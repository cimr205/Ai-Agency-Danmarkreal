import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Enums, Tables } from '@/integrations/supabase/types';

type EmployeeName = { employee_profiles: Pick<Tables<'employee_profiles'>, 'full_name'> | null };
export type LeaveRequestWithEmployee = Tables<'leave_requests'> & EmployeeName;
export type AttendanceLogWithEmployee = Tables<'attendance_logs'> & EmployeeName;
export type PayrollWithEmployee = Tables<'payroll'> & EmployeeName;

// Employees
export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { full_name: string; email: string; position?: string; department?: string; phone?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      // Generate a short employee ID like EMP-001
      const { data: existingEmps } = await supabase
        .from('employee_profiles')
        .select('employee_id')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastNum = existingEmps?.[0]?.employee_id
        ? parseInt(existingEmps[0].employee_id.replace(/\D/g, '')) || 0
        : 0;
      const nextId = `EMP-${String(lastNum + 1).padStart(3, '0')}`;

      // If someone with this email already has portal access in this company,
      // link the new employee record to their account so they show up as
      // themselves everywhere (shift assignment, "who am I" lookups, etc.)
      // instead of becoming an orphaned HR-only record.
      // ilike's pattern arg treats % and _ as wildcards — escape them so an
      // email like "john_doe@co.dk" can't match a different user's account.
      const escapedEmail = input.email.replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data: matchingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('company_id', profile.company_id)
        .ilike('email', escapedEmail)
        .maybeSingle();

      const { data, error } = await supabase
        .from('employee_profiles')
        .insert({
          ...input,
          employee_id: nextId,
          company_id: profile.company_id,
          created_by: session.user.id,
          user_id: matchingProfile?.user_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

// Attendance
export function useAttendance(params?: { date?: string }) {
  return useQuery({
    queryKey: ['attendance', params],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select('*, employee_profiles(full_name)')
        .order('check_in', { ascending: false });
      if (params?.date) {
        query = query.gte('check_in', `${params.date}T00:00:00`).lte('check_in', `${params.date}T23:59:59`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as AttendanceLogWithEmployee[];
    },
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_profile_id: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('attendance_logs')
        .insert({ employee_profile_id: input.employee_profile_id, company_id: profile.company_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .update({ check_out: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

// Leave
export function useLeaveRequests() {
  return useQuery({
    queryKey: ['leave'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, employee_profiles(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as LeaveRequestWithEmployee[];
    },
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_profile_id: string; type: string; start_date: string; end_date: string; reason?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('leave_requests')
        .insert({ ...input, type: input.type as Enums<'leave_type'>, company_id: profile.company_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });
}

export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved' as Enums<'leave_status'>, approved_by: session?.user.id, approved_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });
}

export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('leave_requests')
        .update({ status: 'rejected' as Enums<'leave_status'> })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });
}

// Payroll
export function usePayroll(params?: { period?: string }) {
  return useQuery({
    queryKey: ['payroll', params],
    queryFn: async () => {
      let query = supabase
        .from('payroll')
        .select('*, employee_profiles(full_name)')
        .order('created_at', { ascending: false });
      if (params?.period) query = query.eq('period', params.period);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as PayrollWithEmployee[];
    },
  });
}

export function useCreatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_profile_id: string; base_salary: number; bonus?: number; deductions?: number; net_salary: number; period: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('payroll')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

// Recruitment
export function useRecruitment() {
  return useQuery({
    queryKey: ['recruitment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recruitment')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRecruitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { position: string; department?: string; description?: string; requirements?: string; salary_range?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('recruitment')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment'] }),
  });
}

export function useUpdateRecruitmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from('recruitment')
        .update({ status: status as Enums<'recruitment_status'> })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment'] }),
  });
}
