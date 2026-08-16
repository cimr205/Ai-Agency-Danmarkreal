import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type EmployeeSummary = Pick<Tables<'employee_profiles'>, 'full_name' | 'department' | 'position'>;
export type WorkSchedule = Tables<'work_schedules'> & { employee_profiles: EmployeeSummary | null };
export type AttendanceLog = Tables<'attendance_logs'> & { employee_profiles: EmployeeSummary | null };
export type ActiveSession = (Tables<'attendance_logs'> & { active?: undefined }) | { employee_profile_id: string; active: false };

// ─── Workforce Settings ───
export function useWorkforceSettings() {
  return useQuery({
    queryKey: ['workforce-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workforce_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertWorkforceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { work_model: string; default_start_time?: string; default_end_time?: string; weekly_hours?: number }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) throw new Error('No company');

      const { data, error } = await supabase
        .from('workforce_settings')
        .upsert({ ...input, company_id: profile.company_id }, { onConflict: 'company_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workforce-settings'] }),
  });
}

// ─── Work Schedules ───
export function useWorkSchedules(params?: { startDate?: string; endDate?: string; employeeId?: string }) {
  return useQuery({
    queryKey: ['work-schedules', params],
    queryFn: async () => {
      let query = supabase
        .from('work_schedules')
        .select('*, employee_profiles(full_name, department, position)')
        .order('schedule_date', { ascending: true });

      if (params?.startDate) query = query.gte('schedule_date', params.startDate);
      if (params?.endDate) query = query.lte('schedule_date', params.endDate);
      if (params?.employeeId) query = query.eq('employee_profile_id', params.employeeId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WorkSchedule[];
    },
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_profile_id: string;
      schedule_date: string;
      start_time: string;
      end_time: string;
      title?: string;
      break_minutes?: number;
      notes?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) throw new Error('No company');

      const { data, error } = await supabase
        .from('work_schedules')
        .insert({
          ...input,
          company_id: profile.company_id,
          created_by: session.user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedules'] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Tables<'work_schedules'>>) => {
      const { data, error } = await supabase
        .from('work_schedules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedules'] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedules'] }),
  });
}

// ─── Enhanced Attendance (Time Tracking) ───
export function useTimeEntries(params?: { startDate?: string; endDate?: string; employeeId?: string }) {
  return useQuery({
    queryKey: ['time-entries', params],
    queryFn: async () => {
      let query = supabase
        .from('attendance_logs')
        .select('*, employee_profiles(full_name, department, position, user_id)')
        .order('check_in', { ascending: false });

      if (params?.startDate) query = query.gte('check_in', `${params.startDate}T00:00:00`);
      if (params?.endDate) query = query.lte('check_in', `${params.endDate}T23:59:59`);
      if (params?.employeeId) query = query.eq('employee_profile_id', params.employeeId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AttendanceLog[];
    },
  });
}

export function useMyActiveSession() {
  return useQuery({
    queryKey: ['my-active-session'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Find employee profile for current user
      let { data: empProfile } = await supabase
        .from('employee_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      // Auto-create employee profile if missing
      if (!empProfile) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('company_id, full_name, email')
          .eq('user_id', session.user.id)
          .single();
        if (!userProfile?.company_id) return null;

        const employeeId = `EMP-${Date.now()}`;
        const { data: newEmp } = await supabase
          .from('employee_profiles')
          .insert({
            user_id: session.user.id,
            company_id: userProfile.company_id,
            full_name: userProfile.full_name || session.user.email?.split('@')[0] || 'Employee',
            email: userProfile.email || session.user.email || '',
            employee_id: employeeId,
            created_by: session.user.id,
          })
          .select('id')
          .single();
        if (!newEmp) return null;
        empProfile = newEmp;
      }

      // Get any active session (no check_out) — never auto-close
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_profile_id', empProfile.id)
        .is('check_out', null)
        .order('check_in', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, employee_profile_id: empProfile.id } : { employee_profile_id: empProfile.id, active: false };
    },
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeProfileId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) throw new Error('No company');

      const { data, error } = await supabase
        .from('attendance_logs')
        .insert({ employee_profile_id: employeeProfileId, company_id: profile.company_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-active-session'] });
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['workforce-live'] });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attendanceId: string) => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .update({ check_out: new Date().toISOString() })
        .eq('id', attendanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-active-session'] });
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['workforce-live'] });
    },
  });
}

// ─── Workforce Live Dashboard Data ───
export function useWorkforceLive() {
  return useQuery({
    queryKey: ['workforce-live'],
    refetchInterval: 30000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Get all today's attendance
      const { data: todayLogs, error } = await supabase
        .from('attendance_logs')
        .select('*, employee_profiles(full_name, department, position)')
        .gte('check_in', `${today}T00:00:00`)
        .order('check_in', { ascending: false });
      if (error) throw error;

      const logs = (todayLogs || []) as unknown as AttendanceLog[];
      const activeNow = logs.filter(l => l.check_in && !l.check_out);
      const completedToday = logs.filter(l => l.check_out);
      // Missing checkout is informational only — NEVER auto-close sessions
      const missingCheckout: AttendanceLog[] = [];

      // Calculate total hours today
      let totalHoursToday = 0;
      logs.forEach(l => {
        const end = l.check_out ? new Date(l.check_out).getTime() : Date.now();
        totalHoursToday += (end - new Date(l.check_in).getTime()) / 3600000;
      });

      return {
        activeNow,
        completedToday,
        missingCheckout,
        totalHoursToday: Math.round(totalHoursToday * 10) / 10,
        totalEntriesToday: logs.length,
        logs,
      };
    },
  });
}

// ─── Workforce Reports ───
export function useWorkforceReport(params: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: ['workforce-report', params],
    queryFn: async () => {
      // Get attendance in range
      const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('*, employee_profiles(full_name, department, position)')
        .gte('check_in', `${params.startDate}T00:00:00`)
        .lte('check_in', `${params.endDate}T23:59:59`)
        .order('check_in', { ascending: true });
      if (error) throw error;

      // Get schedules in range
      const { data: schedules } = await supabase
        .from('work_schedules')
        .select('*, employee_profiles(full_name, department)')
        .gte('schedule_date', params.startDate)
        .lte('schedule_date', params.endDate);

      // Aggregate per employee
      const employeeMap = new Map<string, {
        name: string;
        department: string;
        actualHours: number;
        plannedHours: number;
        daysWorked: number;
        entries: number;
      }>();

      ((logs || []) as unknown as AttendanceLog[]).forEach(l => {
        const empId = l.employee_profile_id;
        const existing = employeeMap.get(empId) || {
          name: l.employee_profiles?.full_name || 'Unknown',
          department: l.employee_profiles?.department || '-',
          actualHours: 0,
          plannedHours: 0,
          daysWorked: 0,
          entries: 0,
        };
        const end = l.check_out ? new Date(l.check_out).getTime() : Date.now();
        existing.actualHours += (end - new Date(l.check_in).getTime()) / 3600000;
        existing.entries += 1;
        employeeMap.set(empId, existing);
      });

      // Count unique days worked
      const dayMap = new Map<string, Set<string>>();
      ((logs || []) as unknown as AttendanceLog[]).forEach(l => {
        const empId = l.employee_profile_id;
        if (!dayMap.has(empId)) dayMap.set(empId, new Set());
        dayMap.get(empId)!.add(new Date(l.check_in).toISOString().split('T')[0]);
      });
      dayMap.forEach((days, empId) => {
        const e = employeeMap.get(empId);
        if (e) e.daysWorked = days.size;
      });

      // Add planned hours from schedules
      ((schedules || []) as unknown as WorkSchedule[]).forEach(s => {
        const empId = s.employee_profile_id;
        const existing = employeeMap.get(empId) || {
          name: s.employee_profiles?.full_name || 'Unknown',
          department: s.employee_profiles?.department || '-',
          actualHours: 0,
          plannedHours: 0,
          daysWorked: 0,
          entries: 0,
        };
        const planned = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 3600000 - (s.break_minutes || 0) / 60;
        existing.plannedHours += Math.max(0, planned);
        employeeMap.set(empId, existing);
      });

      const employees = Array.from(employeeMap.entries()).map(([id, data]) => ({
        id,
        ...data,
        actualHours: Math.round(data.actualHours * 10) / 10,
        plannedHours: Math.round(data.plannedHours * 10) / 10,
        deviation: Math.round((data.actualHours - data.plannedHours) * 10) / 10,
        adherence: data.plannedHours > 0 ? Math.round((data.actualHours / data.plannedHours) * 100) : null,
      }));

      const totalActual = employees.reduce((s, e) => s + e.actualHours, 0);
      const totalPlanned = employees.reduce((s, e) => s + e.plannedHours, 0);

      return {
        employees,
        totalActual: Math.round(totalActual * 10) / 10,
        totalPlanned: Math.round(totalPlanned * 10) / 10,
        totalDeviation: Math.round((totalActual - totalPlanned) * 10) / 10,
        averageAdherence: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : null,
      };
    },
  });
}
