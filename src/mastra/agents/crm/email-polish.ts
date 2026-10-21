/**
 * LLM-assisted email-draft polish (propose-only, draft-only) — the first
 * department vertical wired to the shared model router.
 *
 * It builds the deterministic, lawful-basis-gated draft from {@link draftEmail}
 * and then OPTIONALLY refines the wording with a language model resolved through
 * the router at `simple` complexity (so the local 2B may be used when enabled).
 * The polish function is INJECTED so unit tests stay deterministic; the live
 * polish is built by {@link buildLivePolish}.
 *
 * Invariants (unchanged from email-drafter):
 *  - No lawful basis → skipped, never drafted (no cold email).
 *  - The proposal is always `tasks.create` holding the body — NEVER `email.send`.
 *  - The model only rephrases the existing draft; it is instructed not to invent
 *    facts. If the LLM polish fails or no simple model is available, we keep the
 *    deterministic draft (a safe baseline — a `simple` task is never blocked).
 */
import { draftEmail, hasLawfulBasis, type Recipient, type EmailDraft } from "./email-drafter.ts";
import type { createActionProposer } from "../../tools/action-proposal.ts";

type Proposer = ReturnType<typeof createActionProposer>;

/** Refines a draft body. Injected: live model in prod, deterministic stub in tests. */
export type PolishFn = (draft: EmailDraft, recipient: Recipient) => Promise<string>;

export interface PolishedResult {
  recipientId: string;
  status: "proposed" | "skipped";
  polished: boolean;
  reason?: string;
}

export async function proposePolishedEmailDrafts(
  proposer: Proposer,
  recipients: Recipient[],
  topic: string,
  polish?: PolishFn,
): Promise<PolishedResult[]> {
  const out: PolishedResult[] = [];
  for (const r of recipients) {
    if (!hasLawfulBasis(r)) {
      out.push({ recipientId: r.id, status: "skipped", polished: false, reason: "no lawful basis — no cold email" });
      continue;
    }
    const base = draftEmail(r, topic);
    let body = base.body;
    let polished = false;
    if (polish) {
      try {
        const refined = (await polish(base, r))?.trim();
        if (refined) { body = refined; polished = true; }
      } catch {
        // LLM polish unavailable/failed → keep the deterministic draft (safe baseline).
      }
    }
    await proposer.propose({
      actionName: "tasks.create", // NEVER email.send
      input: {
        title: `Review email draft to ${r.name ?? r.id}: ${base.subject}`,
        description:
          `Proposed email DRAFT (not sent)${polished ? ", LLM-polished" : ""}. Subject: ${base.subject}\n\n${body}\n\n` +
          `(Proposed by the CRM agent. Approving creates a review task; sending is a separate, human-approved step with a lawful basis.)`,
        lead_id: r.id,
      },
      reason: `Personalized draft for ${r.relationship ?? "known contact"}${polished ? " (polished)" : ""}`,
      idempotencyKey: `crm-emaildraft-${r.id}`,
    });
    out.push({ recipientId: r.id, status: "proposed", polished });
  }
  return out;
}

/**
 * Builds a live {@link PolishFn} backed by the router's `crm.email.draft`
 * (simple) model. Returns null when no simple model is configured — callers then
 * keep the deterministic draft. This vertical is `simple` only; it never
 * requests a `complex` model and therefore never triggers a BLOCKED downgrade.
 *
 * Imported lazily by callers that actually run live, to avoid pulling
 * @mastra/core/agent into deterministic unit tests.
 */
export async function buildLivePolish(): Promise<PolishFn | null> {
  const { Agent } = await import("@mastra/core/agent");
  const { resolveModelForTask } = await import("../../model-router.ts");
  const r = resolveModelForTask("crm.email.draft");
  if (r.status !== "ok") return null;
  const agent = new Agent({
    id: "crm-email-polish",
    name: "crm-email-polish",
    instructions:
      "Du forbedrer et dansk e-mail-udkast. Behold ALLE fakta uændret og opfind intet nyt. " +
      "Returnér kun den forbedrede brødtekst, høflig og professionel, på dansk.",
    model: r.model,
  });
  return async (draft) => {
    const res = await agent.generate(
      `Forbedr denne e-mail-brødtekst uden at tilføje nye fakta:\n\n${draft.body}`,
      { modelSettings: { temperature: 0.3, maxOutputTokens: 200 } },
    );
    return String((res as { text?: unknown }).text ?? "");
  };
}
