/**
 * Staffing-gap detector (read-only, propose-only).
 *
 * Operates on real rows: `shifts` (assigned_employee_id, shift_date, start_time,
 * end_time, status, department_id) and `leave_requests` (employee_profile_id,
 * start_date, end_date, status). It detects unassigned shifts (under-staffing),
 * double-booked employees (conflicts) and shift-vs-approved-leave conflicts, and
 * sums PLANNED hours per employee.
 *
 * IMPORTANT DATA-QUALITY NOTE: there is no actual-time table in the schema
 * (no attendance/time_entries). Planned shift hours are NOT actual worked hours.
 * `dataQuality.actualHoursAvailable` is always false here, and payroll preparation
 * from actual hours is BLOCKED until such a table exists (see HR_QA_DECISIONS HR-4).
 *
 * No individual wellbeing/health/burnout inference. Only operational aggregates.
 * Proposals (conflict resolution) go through the propose-only bridge; nothing
 * is written, no roster is applied, and payroll is never touched.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Shift {
  id: string;
  assigned_employee_id: string | null;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // ISO or HH:mm on shift_date
  end_time: string;
  status?: string;
  department_id?: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_profile_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  status: string; // compared case-insensitively; only "approved" blocks a shift
}

function toMs(shift_date: string, time: string): number {
  // time may be a full ISO timestamp or an HH:mm[:ss] on the shift date.
  const asIso = Date.parse(time);
  if (!Number.isNaN(asIso) && /\d{4}-\d{2}-\d{2}/.test(time)) return asIso;
  return Date.parse(`${shift_date}T${time.length === 5 ? time + ":00" : time}`);
}

function overlaps(a: Shift, b: Shift): boolean {
  const aS = toMs(a.shift_date, a.start_time);
  const aE = toMs(a.shift_date, a.end_time);
  const bS = toMs(b.shift_date, b.start_time);
  const bE = toMs(b.shift_date, b.end_time);
  return aS < bE && bS < aE;
}

/** Shifts with no assigned employee — an under-staffing signal. */
export function unassignedShifts(shifts: Shift[]): Shift[] {
  return shifts.filter((s) => !s.assigned_employee_id);
}

export interface Conflict {
  type: "double_booked" | "shift_during_leave";
  employeeId: string;
  shiftIds: string[];
  detail: string;
}

/** Same employee assigned to overlapping shifts. */
export function doubleBookings(shifts: Shift[]): Conflict[] {
  const byEmp = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!s.assigned_employee_id) continue;
    (byEmp.get(s.assigned_employee_id) ?? byEmp.set(s.assigned_employee_id, []).get(s.assigned_employee_id)!).push(s);
  }
  const conflicts: Conflict[] = [];
  for (const [emp, list] of byEmp) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].shift_date === list[j].shift_date && overlaps(list[i], list[j])) {
          conflicts.push({
            type: "double_booked",
            employeeId: emp,
            shiftIds: [list[i].id, list[j].id],
            detail: `Overlapping shifts on ${list[i].shift_date}`,
          });
        }
      }
    }
  }
  return conflicts;
}

/** An assigned shift whose date falls inside an APPROVED leave for that employee. */
export function shiftLeaveConflicts(shifts: Shift[], leave: LeaveRequest[]): Conflict[] {
  const approved = leave.filter((l) => l.status.toLowerCase() === "approved");
  const conflicts: Conflict[] = [];
  for (const s of shifts) {
    if (!s.assigned_employee_id) continue;
    for (const l of approved) {
      if (l.employee_profile_id !== s.assigned_employee_id) continue;
      if (s.shift_date >= l.start_date && s.shift_date <= l.end_date) {
        conflicts.push({
          type: "shift_during_leave",
          employeeId: s.assigned_employee_id,
          shiftIds: [s.id],
          detail: `Shift on ${s.shift_date} overlaps approved leave ${l.start_date}..${l.end_date}`,
        });
      }
    }
  }
  return conflicts;
}

export interface StaffingReport {
  unassignedShiftCount: number;
  conflicts: Conflict[];
  plannedHoursByEmployee: Record<string, number>;
  dataQuality: { actualHoursAvailable: false; note: string };
}

/** Operational staffing report. PLANNED hours only — never presented as actual time. */
export function staffingReport(shifts: Shift[], leave: LeaveRequest[]): StaffingReport {
  const plannedHoursByEmployee: Record<string, number> = {};
  for (const s of shifts) {
    if (!s.assigned_employee_id) continue;
    const hrs = (toMs(s.shift_date, s.end_time) - toMs(s.shift_date, s.start_time)) / 3_600_000;
    if (hrs > 0) plannedHoursByEmployee[s.assigned_employee_id] = (plannedHoursByEmployee[s.assigned_employee_id] ?? 0) + hrs;
  }
  return {
    unassignedShiftCount: unassignedShifts(shifts).length,
    conflicts: [...doubleBookings(shifts), ...shiftLeaveConflicts(shifts, leave)],
    plannedHoursByEmployee,
    dataQuality: {
      actualHoursAvailable: false,
      note: "No actual-time table in schema; these are PLANNED shift hours, not worked hours. Payroll prep from actual hours is BLOCKED.",
    },
  };
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a tasks.create DRAFT to resolve each staffing conflict. Never touches payroll, never applies a roster. */
export async function proposeConflictResolutions(proposer: Proposer, shifts: Shift[], leave: LeaveRequest[]) {
  const report = staffingReport(shifts, leave);
  const results = [];
  for (const c of report.conflicts) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Resolve staffing conflict (${c.type}) for employee ${c.employeeId}`,
          description: `${c.detail}. Shifts: ${c.shiftIds.join(", ")}. Review and reschedule. (Proposed by the HR agent; approve to create the task. No roster is changed automatically; payroll is never affected.)`,
        },
        reason: `Staffing conflict: ${c.type}`,
        idempotencyKey: `hr-conflict-${c.type}-${c.shiftIds.join("-")}`,
      }),
    );
  }
  return results;
}
