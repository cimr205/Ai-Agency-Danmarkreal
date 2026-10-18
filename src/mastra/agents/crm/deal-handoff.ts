/**
 * deal → customer → task → invoice hand-off (read-only planning, propose-only execution).
 *
 * For a verified-won deal, plan the ordered hand-off steps and submit each as a
 * DRAFT proposal through the Action Registry bridge. Steps whose registry-required
 * fields are not available are NOT fabricated — they are returned as `blocked`
 * (missing data) or `deferred` (depends on an id that only exists after an earlier
 * step is approved). Nothing is auto-executed; nothing is invented.
 *
 * Registry contracts honoured:
 *   crm.customer.create → requires { name, email }
 *   tasks.create        → requires { title }
 *   invoice.create      → requires { customer_id, amount }   (manager, high, DRAFT)
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";
import type { Deal } from "./stalled-deals.ts";

export interface HandoffContext {
  /** Terminal/won stages that make a deal eligible for hand-off. Default won/closed-won. */
  wonStages?: string[];
  /** Known customer contact for customer.create, if the deal has no customer_id yet. */
  contact?: { name?: string; email?: string; phone?: string; company_name?: string };
}

export type StepStatus = "proposed" | "blocked" | "deferred";

export interface HandoffStep {
  actionName: "crm.customer.create" | "tasks.create" | "invoice.create";
  input: Record<string, unknown>;
  status: StepStatus;
  reason?: string;
  idempotencyKey: string;
}

function isWon(deal: Deal, won: string[]): boolean {
  const s = deal.stage.toLowerCase();
  return won.some((w) => s.includes(w));
}

/**
 * Plan the ordered steps without proposing anything. Pure and deterministic.
 * Returns an empty plan when the deal is not won.
 */
export function planHandoff(deal: Deal & { customer_id?: string | null }, ctx: HandoffContext = {}): HandoffStep[] {
  const won = (ctx.wonStages ?? ["won"]).map((s) => s.toLowerCase());
  if (!isWon(deal, won)) return [];

  const steps: HandoffStep[] = [];
  let customerKnown = Boolean(deal.customer_id);

  // 1. Customer: only if the deal has none. Never fabricate name/email.
  if (!deal.customer_id) {
    const c = ctx.contact;
    if (c?.name && c?.email) {
      steps.push({
        actionName: "crm.customer.create",
        input: { name: c.name, email: c.email, phone: c.phone, company_name: c.company_name },
        status: "proposed",
        idempotencyKey: `crm-handoff-customer-${deal.id}`,
      });
    } else {
      steps.push({
        actionName: "crm.customer.create",
        input: {},
        status: "blocked",
        reason: "No customer linked and no contact name+email available — cannot create a customer without real data.",
        idempotencyKey: `crm-handoff-customer-${deal.id}`,
      });
    }
  }

  // 2. Onboarding task — always proposable (only needs a title).
  steps.push({
    actionName: "tasks.create",
    input: {
      title: `Onboarding: ${deal.title ?? deal.id}`,
      description: `Won deal ${deal.title ?? deal.id} (value ${deal.value} ${deal.currency ?? ""}). Prepare onboarding and delivery. (Proposed by the CRM agent; approve to create.)`,
      deal_id: deal.id,
    },
    status: "proposed",
    idempotencyKey: `crm-handoff-task-${deal.id}`,
  });

  // 3. Invoice DRAFT — needs a real customer_id. If the customer must be created first,
  //    its id only exists after approval, so defer rather than invent one.
  if (customerKnown) {
    steps.push({
      actionName: "invoice.create",
      input: { customer_id: deal.customer_id, amount: deal.value, notes: `Invoice for deal ${deal.title ?? deal.id}` },
      status: "proposed",
      idempotencyKey: `crm-handoff-invoice-${deal.id}`,
    });
  } else {
    steps.push({
      actionName: "invoice.create",
      input: { amount: deal.value },
      status: "deferred",
      reason: "Invoice needs customer_id; propose only after the customer is created and approved.",
      idempotencyKey: `crm-handoff-invoice-${deal.id}`,
    });
  }

  return steps;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Submit only the `proposed` steps through the bridge. Returns the plan with submit results attached. */
export async function proposeHandoff(
  proposer: Proposer,
  deal: Deal & { customer_id?: string | null },
  ctx: HandoffContext = {},
) {
  const plan = planHandoff(deal, ctx);
  const submitted = [];
  for (const step of plan) {
    if (step.status !== "proposed") continue;
    const result = await proposer.propose({
      actionName: step.actionName,
      input: step.input,
      reason: `Deal hand-off step: ${step.actionName}`,
      idempotencyKey: step.idempotencyKey,
    });
    submitted.push({ step: step.actionName, result });
  }
  return { plan, submitted };
}
