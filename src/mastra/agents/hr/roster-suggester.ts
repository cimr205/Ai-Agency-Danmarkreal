/**
 * Roster cover suggester (read-only, propose-only).
 *
 * Complements `staffing-gaps` (which DETECTS problems) by SUGGESTING cover for
 * unassigned shifts: for each open shift, finds employees who are available — not on
 * approved leave that date, and not already assigned an overlapping shift — and (if
 * supplied) have a required skill. Proposes a `tasks.create` review DRAFT suggesting a
 * cover; it never assigns a roster (there is no shift-assignment action in the
 * registry — HR_QA_DECISIONS) and never fabricates availability.
 *
 * Availability uses planned shifts + approved leave only; there is no actual-time
 * table (HR-4), so this is scheduling, not worked-hours. No individual wellbeing/
 * burnout inference.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";
import type { Shift, LeaveRequest } from "./staffing-gaps.ts";

export interface Employee {
  id: string;
  name?: string;
  /** Optional skills; when a shift requires a skill, only matching employees are offered. */
  skills?: string[];
}

function toMs(shift_date: string, time: string): number {
  const asIso = Date.parse(time);
  if (!Number.isNaN(asIso) && /\d{4}-\d{2}-\d{2}/.test(time)) return asIso;
  return Date.parse(`${shift_date}T${time.length === 5 ? time + ":00" : time}`);
}

function overlaps(a: Shift, b: Shift): boolean {
  return toMs(a.shift_date, a.start_time) < toMs(b.shift_date, b.end_time) &&
    toMs(b.shift_date, b.start_time) < toMs(a.shift_date, a.end_time);
}

function onApprovedLeave(empId: string, date: string, leave: LeaveRequest[]): boolean {
  return leave.some(
    (l) => l.status.toLowerCase() === "approved" && l.employee_profile_id === empId && date >= l.start_date && date <= l.end_date,
  );
}

export interface ShiftRequirement {
  /** Optional skill a shift needs; employees without it are not offered. */
  requiredSkill?: string;
}

export interface CoverSuggestion {
  shiftId: string;
  shiftDate: string;
  candidates: Array<{ id: string; name?: string }>;
}

/** For each unassigned shift, list available candidates (deterministic order). */
export function suggestCover(
  shifts: Shift[],
  employees: Employee[],
  leave: LeaveRequest[],
  requirements: Record<string, ShiftRequirement> = {},
): CoverSuggestion[] {
  const assignedByEmp = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (s.assigned_employee_id) {
      (assignedByEmp.get(s.assigned_employee_id) ?? assignedByEmp.set(s.assigned_employee_id, []).get(s.assigned_employee_id)!).push(s);
    }
  }

  const out: CoverSuggestion[] = [];
  for (const shift of shifts) {
    if (shift.assigned_employee_id) continue; // only open shifts
    const req = requirements[shift.id];
    const candidates = employees.filter((e) => {
      if (req?.requiredSkill && !(e.skills ?? []).map((s) => s.toLowerCase()).includes(req.requiredSkill.toLowerCase())) {
        return false;
      }
      if (onApprovedLeave(e.id, shift.shift_date, leave)) return false;
      const theirShifts = assignedByEmp.get(e.id) ?? [];
      if (theirShifts.some((s) => s.shift_date === shift.shift_date && overlaps(s, shift))) return false;
      return true;
    });
    out.push({
      shiftId: shift.id,
      shiftDate: shift.shift_date,
      candidates: candidates.map((e) => ({ id: e.id, name: e.name })),
    });
  }
  return out;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a tasks.create cover-review DRAFT per open shift. Never assigns a roster. */
export async function proposeCover(
  proposer: Proposer,
  shifts: Shift[],
  employees: Employee[],
  leave: LeaveRequest[],
  requirements: Record<string, ShiftRequirement> = {},
) {
  const results = [];
  for (const s of suggestCover(shifts, employees, leave, requirements)) {
    const who = s.candidates.length
      ? s.candidates.map((c) => c.name ?? c.id).join(", ")
      : "no available employee found";
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Cover open shift ${s.shiftId} on ${s.shiftDate}`,
          description: `Open (unassigned) shift on ${s.shiftDate}. Available candidates: ${who}. Review and assign. (Proposed by the HR agent; approve to create the task. No roster is changed automatically; availability is from planned shifts + approved leave, not actual hours.)`,
        },
        reason: s.candidates.length ? "Open shift with available cover" : "Open shift with no available cover",
        idempotencyKey: `hr-cover-${s.shiftId}`,
      }),
    );
  }
  return results;
}
