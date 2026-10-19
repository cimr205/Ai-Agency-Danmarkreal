import { describe, it, expect, vi } from "vitest";
import { suggestCover, proposeCover, type Employee } from "@/mastra/agents/hr/roster-suggester";
import type { Shift, LeaveRequest } from "@/mastra/agents/hr/staffing-gaps";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const shifts: Shift[] = [
  { id: "open1", assigned_employee_id: null, shift_date: "2026-10-20", start_time: "09:00", end_time: "17:00" },
  { id: "open2", assigned_employee_id: null, shift_date: "2026-10-21", start_time: "09:00", end_time: "17:00" },
  { id: "busy", assigned_employee_id: "e2", shift_date: "2026-10-20", start_time: "08:00", end_time: "12:00" }, // e2 busy that morning
];
const employees: Employee[] = [
  { id: "e1", name: "Anna", skills: ["barista"] },
  { id: "e2", name: "Bo", skills: ["barista", "manager"] },
  { id: "e3", name: "Cia" }, // no skills
];
const leave: LeaveRequest[] = [
  { id: "l1", employee_profile_id: "e1", start_date: "2026-10-21", end_date: "2026-10-21", status: "approved" }, // e1 off on 21st
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("suggestCover", () => {
  it("offers only available employees (not on leave, not double-booked)", () => {
    const sug = suggestCover(shifts, employees, leave);
    const open1 = sug.find((s) => s.shiftId === "open1")!;
    // open1 is 09–17 on the 20th; e2 is busy 08–12 that day → excluded; e1 and e3 available.
    expect(open1.candidates.map((c) => c.id).sort()).toEqual(["e1", "e3"]);
    const open2 = sug.find((s) => s.shiftId === "open2")!;
    // open2 on the 21st; e1 on approved leave → excluded; e2 and e3 available.
    expect(open2.candidates.map((c) => c.id).sort()).toEqual(["e2", "e3"]);
  });

  it("respects a required skill when supplied", () => {
    const sug = suggestCover(shifts, employees, leave, { open1: { requiredSkill: "manager" } });
    const open1 = sug.find((s) => s.shiftId === "open1")!;
    // Only e2 has "manager", but e2 is busy on the 20th morning → no candidates.
    expect(open1.candidates).toEqual([]);
  });
});

describe("proposeCover", () => {
  it("proposes a tasks.create review per open shift; never assigns a roster", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeCover(proposer, shifts, employees, leave);
    expect(seen.map((p) => p.idempotencyKey).sort()).toEqual(["hr-cover-open1", "hr-cover-open2"]);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true); // no shift-assignment action
    expect(results).toHaveLength(2);
  });
});
