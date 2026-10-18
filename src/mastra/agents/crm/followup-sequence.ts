/**
 * Lawful follow-up sequence planner (read-only planning, propose-only execution).
 *
 * Plans a multi-step follow-up cadence for a lead that has a lawful basis to be
 * contacted (reuses the email-drafter's lawful-basis check). Each step becomes a
 * `tasks.create` DRAFT that HOLDS a draft message with a scheduled due date —
 * nothing is ever auto-sent, and a step without a lawful basis is refused.
 *
 * Reuses the registry contract: tasks.create needs only a title; we add a due_date
 * (optional field) so the follow-up is scheduled for human action.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";
import { hasLawfulBasis, draftEmail, type Recipient } from "./email-drafter.ts";

export interface SequenceStep {
  dayOffset: number; // days from the sequence start
  topic: string;
}

export interface PlannedStep {
  dayOffset: number;
  dueDate: string; // YYYY-MM-DD
  subject: string;
  body: string;
}

const DAY_MS = 86_400_000;

export const DEFAULT_CADENCE: SequenceStep[] = [
  { dayOffset: 0, topic: "introduktion og værdi" },
  { dayOffset: 3, topic: "opfølgning med et konkret eksempel" },
  { dayOffset: 7, topic: "sidste venlige opfølgning" },
];

export class NoLawfulBasisForSequenceError extends Error {}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Plan the cadence as dated draft steps. Pure and deterministic. Throws if there
 * is no lawful basis to contact the recipient (no cold sequences).
 */
export function planSequence(
  recipient: Recipient,
  startMs: number,
  cadence: SequenceStep[] = DEFAULT_CADENCE,
): PlannedStep[] {
  if (!hasLawfulBasis(recipient)) {
    throw new NoLawfulBasisForSequenceError(`No lawful basis to build a follow-up sequence for ${recipient.id}.`);
  }
  return cadence.map((step) => {
    const draft = draftEmail(recipient, step.topic);
    return {
      dayOffset: step.dayOffset,
      dueDate: isoDate(startMs + step.dayOffset * DAY_MS),
      subject: draft.subject,
      body: draft.body,
    };
  });
}

type Proposer = ReturnType<typeof createActionProposer>;

/**
 * Propose each sequence step as a scheduled `tasks.create` DRAFT (holding the draft
 * message). Returns { skipped } for a recipient without a lawful basis — never sent.
 */
export async function proposeSequence(
  proposer: Proposer,
  recipient: Recipient,
  startMs: number,
  cadence: SequenceStep[] = DEFAULT_CADENCE,
) {
  if (!hasLawfulBasis(recipient)) {
    return { status: "skipped" as const, reason: "no lawful basis — no cold follow-up sequence" };
  }
  const steps = planSequence(recipient, startMs, cadence);
  for (const s of steps) {
    await proposer.propose({
      actionName: "tasks.create",
      input: {
        title: `Follow-up (day ${s.dayOffset}) to ${recipient.name ?? recipient.id}: ${s.subject}`,
        description: `Scheduled draft follow-up (NOT sent). Due ${s.dueDate}.\n\n${s.body}\n\n(Proposed by the CRM agent; approving creates a scheduled task. Sending is a separate, human-approved step with a lawful basis.)`,
        due_date: s.dueDate,
        lead_id: recipient.id,
      },
      reason: `Lawful follow-up step day ${s.dayOffset}`,
      idempotencyKey: `crm-seq-${recipient.id}-d${s.dayOffset}`,
    });
  }
  return { status: "proposed" as const, steps: steps.length };
}
