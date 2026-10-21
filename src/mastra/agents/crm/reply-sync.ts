/**
 * Reply-sync intake (read-only matching, propose-only hand-off).
 *
 * Matches inbound email replies to existing leads (by sender email) and proposes a
 * `tasks.create` review DRAFT per matched reply, so a human records the touch and
 * decides the next follow-up. Nothing is auto-updated and no reply is auto-sent.
 *
 * NOTE (registry gap): there is no `crm.lead.update` action in the Action Registry,
 * so the agent cannot directly set `last_touched_at` / `next_followup_at`. That is
 * flagged as OWNER_DECISIONS #10 (add a tenant-isolated `crm.lead.update` action).
 * Until then, the touch is handled via a review task — never by a fabricated action.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface InboundReply {
  id: string;
  fromEmail: string;
  subject?: string;
  receivedAt?: string;
}

export interface LeadRef {
  id: string;
  name?: string;
  email: string;
}

export interface MatchResult {
  matched: Array<{ reply: InboundReply; lead: LeadRef }>;
  unmatched: InboundReply[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Match replies to leads by sender email. Unmatched replies are reported, never guessed onto a lead. */
export function matchRepliesToLeads(replies: InboundReply[], leads: LeadRef[]): MatchResult {
  const byEmail = new Map<string, LeadRef>();
  for (const l of leads) byEmail.set(norm(l.email), l);
  const matched: MatchResult["matched"] = [];
  const unmatched: InboundReply[] = [];
  for (const r of replies) {
    const lead = byEmail.get(norm(r.fromEmail));
    if (lead) matched.push({ reply: r, lead });
    else unmatched.push(r);
  }
  return { matched, unmatched };
}

type Proposer = ReturnType<typeof createActionProposer>;

export interface ReplyOutcome {
  replyId: string;
  status: "proposed" | "unmatched";
  leadId?: string;
}

/** Propose a tasks.create review DRAFT per matched reply. No lead field is written, no reply sent. */
export async function proposeReplyReviews(
  proposer: Proposer,
  replies: InboundReply[],
  leads: LeadRef[],
): Promise<ReplyOutcome[]> {
  const { matched, unmatched } = matchRepliesToLeads(replies, leads);
  const outcomes: ReplyOutcome[] = unmatched.map((r) => ({ replyId: r.id, status: "unmatched" }));

  for (const { reply, lead } of matched) {
    await proposer.propose({
      actionName: "tasks.create",
      input: {
        title: `Reply from ${lead.name ?? lead.email}: ${reply.subject ?? "(no subject)"}`,
        description:
          `Inbound reply received${reply.receivedAt ? ` ${reply.receivedAt}` : ""} from lead ${lead.name ?? lead.email}. ` +
          `Review and decide the next follow-up (record the touch / adjust the schedule). ` +
          `(Proposed by the CRM agent; approve to create the task. No lead field is updated automatically and no reply is sent.)`,
        lead_id: lead.id,
      },
      reason: "Inbound reply matched to a lead",
      idempotencyKey: `crm-reply-${reply.id}`,
    });
    outcomes.push({ replyId: reply.id, status: "proposed", leadId: lead.id });
  }
  return outcomes;
}
