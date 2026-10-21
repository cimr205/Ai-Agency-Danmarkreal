import { describe, it, expect, vi } from "vitest";
import {
  unassignedShifts,
  doubleBookings,
  shiftLeaveConflicts,
  staffingReport,
  proposeConflictResolutions,
  type Shift,
  type LeaveRequest,
} from "@/mastra/agents/hr/staffing-gaps";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const shifts: Shift[] = [
  { id: "s1", assigned_employee_id: "e1", shift_date: "2026-10-20", start_time: "09:00", end_time: "17:00" },
  { id: "s2", assigned_employee_id: "e1", shift_date: "2026-10-20", start_time: "16:00", end_time: "20:00" }, // overlaps s1
  { id: "s3", assigned_employee_id: null, shift_date: "2026-10-21", start_time: "09:00", end_time: "17:00" }, // unassigned
  { id: "s4", assigned_employee_id: "e2", shift_date: "2026-10-22", start_time: "09:00", end_time: "17:00" }, // during leave
];
const leave: LeaveRequest[] = [
  { id: "l1", employee_profile_id: "e2", start_date: "2026-10-22", end_date: "2026-10-24", status: "approved" },
  { id: "l2", employee_profile_id: "e1", start_date: "2026-11-01", end_date: "2026-11-02", status: "pending" }, // not approved, ignored
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("staffing detection", () => {
  it("flags unassigned shifts (under-staffing)", () => {
    expect(unassignedShifts(shifts).map((s) => s.id)).toEqual(["s3"]);
  });
  it("detects double-booked overlapping shifts", () => {
    const d = doubleBookings(shifts);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: "double_booked", employeeId: "e1", shiftIds: ["s1", "s2"] });
  });
  it("detects shifts during APPROVED leave only", () => {
    const c = shiftLeaveConflicts(shifts, leave);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "shift_during_leave", employeeId: "e2", shiftIds: ["s4"] });
  });
});

describe("staffingReport", () => {
  it("reports PLANNED hours with an explicit data-quality flag (actual hours unavailable)", () => {
    const r = staffingReport(shifts, leave);
    expect(r.unassignedShiftCount).toBe(1);
    expect(r.conflicts).toHaveLength(2);
    expect(r.plannedHoursByEmployee.e1).toBe(12); // 8h (s1) + 4h (s2)
    expect(r.dataQuality.actualHoursAvailable).toBe(false);
    expect(r.dataQuality.note).toContain("PLANNED");
  });
});

describe("proposeConflictResolutions", () => {
  it("proposes a tasks.create DRAFT per conflict; never payroll, never roster apply", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeConflictResolutions(proposer, shifts, leave);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(seen.some((p) => p.actionName.startsWith("hr.payroll"))).toBe(false);
    expect(results).toHaveLength(2);
    expect(seen.every((p) => p.requestedApproval === "awaiting_approval")).toBe(true);
  });
});
