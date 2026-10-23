// Pure helpers for the LinkedIn outreach queue — kept Deno/Node-agnostic
// (no Deno.* globals, no remote imports) so they can be unit tested under
// Vitest the same way as _shared/leadUpdate.ts.

const NOTE_MAX = 300;

export function normalizeProfileUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([a-zA-Z0-9_%-]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1].toLowerCase()}` : null;
}

export function clampNote(note: string, max: number = NOTE_MAX): string {
  const t = note.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

export interface LeadGenResultForOutreach {
  id: string;
  company_name: string | null;
  contact_person_name: string | null;
  contact_role: string | null;
  linkedin_url: string | null;
  imported_lead_id: string | null;
}

export interface OutreachRowInput {
  company_id: string;
  lead_gen_result_id: string;
  customer_id: string | null;
  contact_name: string | null;
  contact_role: string | null;
  company_name: string | null;
  linkedin_url: string;
  created_by: string;
}

// Builds insertable outreach rows from lead_gen_results, deduping by
// normalized LinkedIn profile URL (several results can point at the same
// profile via different query-string/locale variants) and counting results
// that have no usable profile URL. Does not touch the database — the caller
// is responsible for filtering out URLs already queued (an existing-row
// check against `linkedin_outreach`, which needs a DB round-trip and so
// isn't part of this pure function).
export function buildOutreachRows(
  results: LeadGenResultForOutreach[],
  companyId: string,
  createdBy: string,
): { rows: OutreachRowInput[]; noProfile: number } {
  const seen = new Set<string>();
  const rows: OutreachRowInput[] = [];
  let noProfile = 0;
  for (const r of results) {
    const url = normalizeProfileUrl(r.linkedin_url);
    if (!url) { noProfile++; continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    rows.push({
      company_id: companyId,
      lead_gen_result_id: r.id,
      customer_id: r.imported_lead_id ?? null,
      contact_name: r.contact_person_name,
      contact_role: r.contact_role,
      company_name: r.company_name,
      linkedin_url: url,
      created_by: createdBy,
    });
  }
  return { rows, noProfile };
}
