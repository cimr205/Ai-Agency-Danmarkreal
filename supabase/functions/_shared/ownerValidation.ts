// Owner validation heuristic for lead-gen chat. See DECISIONS.md section 4 for rationale and
// supabase/functions/_shared/leadSource.ts for the OwnerValidation contract this implements.
//
// NEVER scrapes or calls LinkedIn — only generates a search-link. NEVER fabricates a name: if
// no source yields a plausible owner, owner_name/owner_confidence stay null/0 so the UI shows
// "ikke valideret" (see OWNER_CONFIDENCE_DISPLAY_THRESHOLD in leadSource.ts).

import type { OwnerValidation } from "./leadSource.ts";

export interface OwnerValidationLeadInput {
  name: string;
  website?: string;
  /** Free-text virksomhedsform/companydesc from cvrapi.dk, e.g. "Enkeltmandsvirksomhed". */
  cvrVirksomhedsform?: string;
  /** The registered CVR company name (may differ from the lead's display/trading name). */
  cvrName?: string;
}

const SOLE_PROPRIETORSHIP_TERMS = [
  "enkeltmandsvirksomhed",
  "personligt ejet mindre virksomhed",
];

// Role keywords that indicate a nearby name is likely the owner/manager. Weighted: stronger,
// unambiguous legal/ownership terms score higher than vaguer ones.
const ROLE_KEYWORDS: { term: string; role: string; weight: number }[] = [
  { term: "indehaver", role: "Indehaver", weight: 60 },
  { term: "ejer", role: "Ejer", weight: 60 },
  { term: "direktør", role: "Direktør", weight: 60 },
  { term: "ceo", role: "CEO", weight: 60 },
  { term: "grundlægger", role: "Grundlægger", weight: 50 },
  { term: "founder", role: "Founder", weight: 50 },
  { term: "ansvarlig", role: "Ansvarlig", weight: 50 },
];

// Words that look like capitalized "name" tokens but are actually business/legal/boilerplate
// terms — filtering these out is what keeps the website heuristic from matching company names
// or navigation chrome instead of a person.
const STOPWORDS = new Set(
  [
    "tømrer", "tømrerfirma", "murer", "murerfirma", "snedker", "elektriker", "maler",
    "byg", "byggefirma", "entreprise", "entreprenør", "consulting", "consult",
    "service", "services", "firma", "gruppen", "group", "holding", "aps", "a/s", "i/s",
    "danmark", "denmark", "design", "handel", "nord", "syd", "øst", "vest",
    "læs", "mere", "kontakt", "om", "os", "hjem", "tilbage", "næste", "forrige",
    "velkommen", "alle", "rettigheder", "reserveret", "cookie", "politik", "vilkår",
    "betingelser", "privatlivspolitik", "menu", "søg", "ring", "skriv", "send",
  ].map((w) => w.toLowerCase()),
);

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents for loose matching (æ/ø/å are not decomposed)
    .replace(/[^a-zæøå\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

/** True if the shorter name's tokens are (near-)fully contained in the longer name's tokens. */
function namesFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length === 0) return false;
  const longerSet = new Set(longer);
  const sharedCount = shorter.filter((t) => longerSet.has(t)).length;
  // Require every token of the shorter name to appear in the longer name (handles
  // "Jens Jensen" vs "Jens Peter Jensen"), but tolerate one mismatch for 3+ token names.
  const required = shorter.length <= 2 ? shorter.length : shorter.length - 1;
  return sharedCount >= required;
}

function isPlausibleNameToken(token: string): boolean {
  if (token.length < 2) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  // Reject tokens that are ALL CAPS and longer than 1 char (likely acronyms, e.g. "ABC").
  if (token === token.toUpperCase() && token.length > 1 && /[A-ZÆØÅ]{2,}/.test(token)) return false;
  // Must look like Capitalized word (first letter upper, rest not all-upper).
  return /^[A-ZÆØÅ][a-zæøåA-ZÆØÅ'-]*$/.test(token);
}

/**
 * Extracts a plausible "Firstname Lastname[ Middlename]" person name from the start of a
 * registered CVR company name, for the enkeltmandsvirksomhed heuristic. Danish sole-prop
 * registrations are very often literally the owner's name, sometimes with a trailing business
 * descriptor (e.g. "Jens Jensen Tømrerfirma").
 */
function extractPersonNameFromCvrName(cvrName: string): string | null {
  const cleaned = cvrName.trim().replace(/^v\/\s*/i, "").replace(/^ved\s+/i, "");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const nameTokens: string[] = [];
  for (const token of tokens.slice(0, 3)) {
    if (!isPlausibleNameToken(token)) break;
    nameTokens.push(token);
  }
  if (nameTokens.length < 2) return null;
  return nameTokens.join(" ");
}

interface WebsiteMatch {
  name: string;
  role: string;
  weight: number;
}

/**
 * Finds named individuals near role keywords (indehaver/ejer/direktør/CEO/grundlægger/
 * founder/ansvarlig) in website HTML. Simple regex/proximity heuristic — not NLP — tuned to
 * avoid matching company names or nav/boilerplate text via the STOPWORDS filter.
 */
function extractOwnerCandidatesFromWebsite(html: string): WebsiteMatch[] {
  const text = stripHtmlTags(html);
  const nameRegex =
    /\b([A-ZÆØÅ][a-zæøåA-ZÆØÅ'-]{1,20})\s+([A-ZÆØÅ][a-zæøåA-ZÆØÅ'-]{1,20})(?:\s+([A-ZÆØÅ][a-zæøåA-ZÆØÅ'-]{1,20}))?\b/g;
  const candidates: WebsiteMatch[] = [];
  const WINDOW = 60;

  for (const { term, role, weight } of ROLE_KEYWORDS) {
    const keywordRegex = new RegExp(`\\b${term}\\b`, "gi");
    let kwMatch: RegExpExecArray | null;
    while ((kwMatch = keywordRegex.exec(text)) !== null) {
      const start = Math.max(0, kwMatch.index - WINDOW);
      const end = Math.min(text.length, kwMatch.index + term.length + WINDOW);
      const window = text.slice(start, end);

      let nameMatch: RegExpExecArray | null;
      nameRegex.lastIndex = 0;
      while ((nameMatch = nameRegex.exec(window)) !== null) {
        const words = [nameMatch[1], nameMatch[2], nameMatch[3]].filter(Boolean) as string[];
        if (words.some((w) => !isPlausibleNameToken(w))) continue;
        if (words.some((w) => w.toLowerCase() === term)) continue;
        candidates.push({ name: words.join(" "), role, weight });
      }
    }
  }
  return candidates;
}

function buildLinkedInSearchUrl(ownerName: string, companyName: string): string {
  const query = `${ownerName} ${companyName}`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

/**
 * Validates/infers a lead's likely owner from CVR company-form metadata and/or a crawled
 * website page, never from LinkedIn (no scraping — only a generated search link) and never by
 * guessing: absent evidence yields owner_name: null, owner_confidence: 0.
 */
export function validateOwner(
  lead: OwnerValidationLeadInput,
  websiteHtml?: string,
): OwnerValidation {
  // Source 1: sole-proprietorship CVR heuristic.
  let cvrCandidate: string | null = null;
  if (lead.cvrVirksomhedsform && lead.cvrName) {
    const formLower = lead.cvrVirksomhedsform.toLowerCase();
    if (SOLE_PROPRIETORSHIP_TERMS.some((term) => formLower.includes(term))) {
      cvrCandidate = extractPersonNameFromCvrName(lead.cvrName);
    }
  }

  // Source 2: website role-keyword proximity heuristic.
  const websiteCandidates = websiteHtml ? extractOwnerCandidatesFromWebsite(websiteHtml) : [];
  // Prefer the highest-weighted keyword match; on ties, the first found.
  const bestWebsiteCandidate = websiteCandidates.sort((a, b) => b.weight - a.weight)[0] ?? null;

  const sources: string[] = [];
  let ownerName: string | null = null;
  let ownerRole: string | null = null;
  let confidence = 0;

  const bothPresent = Boolean(cvrCandidate && bestWebsiteCandidate);
  const bothAgree = bothPresent && namesFuzzyMatch(cvrCandidate as string, bestWebsiteCandidate!.name);

  if (bothAgree) {
    ownerName = bestWebsiteCandidate!.name;
    ownerRole = bestWebsiteCandidate!.role;
    confidence = normalizeName(cvrCandidate as string) === normalizeName(bestWebsiteCandidate!.name) ? 92 : 85;
    sources.push("CVR:virksomhedsform", `Website:${bestWebsiteCandidate!.role.toLowerCase()}`);
  } else if (bestWebsiteCandidate) {
    ownerName = bestWebsiteCandidate.name;
    ownerRole = bestWebsiteCandidate.role;
    confidence = bestWebsiteCandidate.weight;
    sources.push(`Website:${bestWebsiteCandidate.role.toLowerCase()}`);
  } else if (cvrCandidate) {
    ownerName = cvrCandidate;
    ownerRole = "Indehaver";
    confidence = 55;
    sources.push("CVR:virksomhedsform");
  }

  return {
    owner_name: ownerName,
    owner_role: ownerRole,
    owner_confidence: confidence,
    owner_sources: sources,
    linkedin_search_url: ownerName ? buildLinkedInSearchUrl(ownerName, lead.name) : null,
  };
}
