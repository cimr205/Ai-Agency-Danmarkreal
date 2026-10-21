import { describe, it, expect, vi } from "vitest";
import { validateLeadUpdate } from "../../supabase/functions/_shared/leadUpdate";
import { createActionProposer } from "@/mastra/tools/action-proposal";

describe("lead update validation", () => {
  it("accepts explicit clears and timezone-qualified timestamps", () => {
    expect(() => validateLeadUpdate({ next_followup_at: null, notes: "", phone: null })).not.toThrow();
    expect(() => validateLeadUpdate({ last_touched_at: "2026-10-21T12:30:00+02:00", status: "contacted" })).not.toThrow();
  });

  it.each([
    {}, { lead_id: "id" }, { status: null }, { status: "invalid" },
    { next_followup_at: "" }, { last_touched_at: "tomorrow" },
    { last_touched_at: "2026-10-21" }, { last_touched_at: "2026-10-21T12:30:00" },
    { phone: 123 }, { notes: {} },
  ])("rejects invalid changes: %j", (input) => {
    expect(() => validateLeadUpdate(input)).toThrow();
  });

  it.each(["AUTO", "DRAFT_APPROVAL"] as const)("requires approval in %s", async (mode) => {
    const submit = vi.fn(async () => ({ id: "proposal", status: "awaiting_approval" }));
    await createActionProposer(submit, () => mode).propose({
      actionName: "crm.lead.update", input: { lead_id: "id", notes: "Reviewed" }, reason: "Review",
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ requestedApproval: "awaiting_approval" }));
  });

  it("does not submit when OFF", async () => {
    const submit = vi.fn();
    await createActionProposer(submit, () => "OFF").propose({
      actionName: "crm.lead.update", input: { lead_id: "id", notes: "Reviewed" }, reason: "Review",
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
