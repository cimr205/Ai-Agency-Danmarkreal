/**
 * Propose-only bridge from a Mastra agent/tool to the existing Action Registry
 * (`supabase/functions/ai-operating-manager`). This is the ONLY way a CRM/sales
 * agent is allowed to cause a change.
 *
 * Design invariants (enforced by tests in src/test/mastra-action-proposal.test.ts):
 *   1. This module holds NO database client and NO Supabase handle. It cannot
 *      write to the database. It can only build an `ActionProposal` and hand it
 *      to an injected `submit` transport (in production: an authenticated POST
 *      to the ai-operating-manager endpoint, which runs requireCompanyAuth, RLS,
 *      idempotency and audit server-side).
 *   2. Every proposal carries an idempotency key.
 *   3. Mode gating: OFF proposes nothing; DRAFT_APPROVAL always requires human
 *      approval; AUTO may request auto-approval ONLY for low-risk actions — the
 *      server still has the final say.
 *
 * The source of truth for action definitions, roles and execution is the edge
 * function. The risk map below is a conservative local mirror used only to gate
 * AUTO; an action missing here is treated as high-risk (never auto-approved) and
 * the server re-validates regardless.
 */

export type ActionMode = "OFF" | "DRAFT_APPROVAL" | "AUTO";
export type ActionRisk = "low" | "medium" | "high" | "critical";

/** Conservative mirror of risk levels verified in ai-operating-manager/index.ts. */
export const ACTION_RISK: Readonly<Record<string, ActionRisk>> = Object.freeze({
  "tasks.create": "low",
  "tasks.complete": "medium",
  "crm.customer.create": "medium",
  "crm.customer.update": "medium",
  "crm.lead.create": "medium",
  "crm.lead.update": "medium",
  "crm.lead.move_stage": "medium",
  "crm.deal.create": "medium",
  "crm.deal.move_stage": "high",
  "calendar.event.create": "medium",
  "calendar.event.update": "medium",
  "invoice.create": "high",
  "marketing.campaign.create": "medium",
  "email.send": "high",
});

export interface ActionProposal {
  actionName: string;
  input: Record<string, unknown>;
  reason: string;
  idempotencyKey: string;
  /** What the agent is asking the server to do with the proposal. */
  requestedApproval: "awaiting_approval" | "auto_approve";
}

/** Result of a submitted proposal, as returned by the registry transport. */
export interface SubmitResult {
  id: string;
  status: string;
  idempotentReplay?: boolean;
}

/** Injected transport: the real one POSTs to ai-operating-manager. Never a DB client. */
export type SubmitProposal = (proposal: ActionProposal) => Promise<SubmitResult>;

export class UnknownActionError extends Error {}

function newIdempotencyKey(): string {
  // crypto.randomUUID: present on globalThis in Node >= 19 and in the browser/jsdom.
  return globalThis.crypto.randomUUID();
}

/**
 * Build a propose-only tool bound to a transport and a per-action mode policy.
 * The returned object exposes exactly one capability — `propose` — and carries
 * no client, so it is structurally incapable of a direct write.
 */
export function createActionProposer(
  submit: SubmitProposal,
  modeFor: (actionName: string) => ActionMode = () => "DRAFT_APPROVAL",
) {
  return Object.freeze({
    kind: "propose-only" as const,
    /**
     * Returns the submit result, or null when the action is OFF (nothing proposed).
     * Throws UnknownActionError for an action not in the registry mirror.
     */
    async propose(args: {
      actionName: string;
      input: Record<string, unknown>;
      reason: string;
      idempotencyKey?: string;
    }): Promise<SubmitResult | null> {
      const risk = ACTION_RISK[args.actionName];
      if (!risk) throw new UnknownActionError(`Unknown action: ${args.actionName}`);

      const mode = modeFor(args.actionName);
      if (mode === "OFF") return null;

      // AUTO only ever requests auto-approval for low-risk actions.
      const requestedApproval =
        mode === "AUTO" && risk === "low" ? "auto_approve" : "awaiting_approval";

      const proposal: ActionProposal = {
        actionName: args.actionName,
        input: args.input,
        reason: args.reason,
        idempotencyKey: args.idempotencyKey?.trim() || newIdempotencyKey(),
        requestedApproval,
      };
      return submit(proposal);
    },
  });
}
