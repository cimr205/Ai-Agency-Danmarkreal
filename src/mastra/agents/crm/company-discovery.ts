/**
 * Company discovery + dedupe + source registry (read-only, propose-only).
 *
 * Takes candidate companies sourced from LAWFUL public registries (the existing
 * `cvr-search` / `companies-house-search` edge functions — DK CVR, UK Companies
 * House), records the data source per candidate, dedupes them against existing
 * `leads` and against each other, and proposes `crm.lead.create` DRAFTs ONLY for
 * net-new companies. It never fabricates contact data: the registry requires
 * name + email, so a candidate without a real email is skipped (not invented),
 * never guessed. Nothing is written; lead creation is a human-approved step.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export type SourceRegistry = "cvr" | "companies_house";

export interface Candidate {
  source: SourceRegistry;
  sourceId: string; // CVR number / UK company number — the authoritative identifier
  company_name: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  industry?: string;
}

export interface ExistingLead {
  id: string;
  name?: string;
  company_name?: string | null;
  email?: string;
  phone?: string | null;
}

const LEGAL_SUFFIXES = /\b(aps|a\/s|as|ivs|ltd|limited|plc|gmbh|inc|llc|holding)\b/g;

/** Normalize a company name for comparison: lowercase, strip legal suffixes + punctuation + spaces. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ") // strip suffixes first, while "a/s" is still intact
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

export interface DedupeResult {
  netNew: Candidate[];
  duplicates: Array<{ candidate: Candidate; reason: string }>;
}

/** Drop candidates matching an existing lead (by normalized name / email / phone) or an earlier candidate. */
export function dedupeCandidates(candidates: Candidate[], existing: ExistingLead[]): DedupeResult {
  const existingNames = new Set(existing.map((l) => normalizeName(l.company_name || l.name || "")).filter(Boolean));
  const existingEmails = new Set(existing.map((l) => norm(l.email)).filter(Boolean));
  const existingPhones = new Set(existing.map((l) => norm(l.phone)).filter(Boolean));

  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const netNew: Candidate[] = [];
  const duplicates: Array<{ candidate: Candidate; reason: string }> = [];

  for (const c of candidates) {
    const nName = normalizeName(c.company_name);
    const key = `${c.source}:${c.sourceId}`;
    if (seenIds.has(key) || seenNames.has(nName)) {
      duplicates.push({ candidate: c, reason: "duplicate within candidate list" });
    } else if (existingNames.has(nName)) {
      duplicates.push({ candidate: c, reason: "matches existing lead by company name" });
    } else if (c.email && existingEmails.has(norm(c.email))) {
      duplicates.push({ candidate: c, reason: "matches existing lead by email" });
    } else if (c.phone && existingPhones.has(norm(c.phone))) {
      duplicates.push({ candidate: c, reason: "matches existing lead by phone" });
    } else {
      netNew.push(c);
      seenNames.add(nName);
      seenIds.add(key);
    }
  }
  return { netNew, duplicates };
}

type Proposer = ReturnType<typeof createActionProposer>;

export interface DiscoveryOutcome {
  sourceId: string;
  status: "proposed" | "skipped_duplicate" | "skipped_no_email";
  reason?: string;
}

/**
 * Propose crm.lead.create DRAFTs for net-new candidates that have a real email.
 * Candidates without an email are skipped (email is required and must not be invented).
 * The data source is recorded in the lead notes and the idempotency key.
 */
export async function proposeDiscoveredLeads(
  proposer: Proposer,
  candidates: Candidate[],
  existing: ExistingLead[],
): Promise<DiscoveryOutcome[]> {
  const { netNew, duplicates } = dedupeCandidates(candidates, existing);
  const outcomes: DiscoveryOutcome[] = duplicates.map((d) => ({
    sourceId: d.candidate.sourceId,
    status: "skipped_duplicate",
    reason: d.reason,
  }));

  for (const c of netNew) {
    if (!c.email) {
      outcomes.push({
        sourceId: c.sourceId,
        status: "skipped_no_email",
        reason: "crm.lead.create requires an email; none available from the source and none will be fabricated.",
      });
      continue;
    }
    await proposer.propose({
      actionName: "crm.lead.create",
      input: {
        name: c.company_name,
        email: c.email,
        phone: c.phone,
        company_name: c.company_name,
      },
      reason: `Discovered via ${c.source} (${c.sourceId})`,
      idempotencyKey: `crm-discovery-${c.source}-${c.sourceId}`,
    });
    outcomes.push({ sourceId: c.sourceId, status: "proposed" });
  }
  return outcomes;
}
