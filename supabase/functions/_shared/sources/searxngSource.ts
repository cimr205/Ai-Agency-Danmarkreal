// SearXNG (self-hosted metasearch) — used NOT as a lead source, but to resolve official
// websites/contact pages for leads that have a name+city but no website yet. Per DECISIONS.md
// section 2, this is a fallback used when a direct crawl fails / no website is already known;
// it is deliberately not a `LeadSource` implementation since it doesn't return leads.
//
// Runs via leadgen/docker-compose.yml's `searxng` service. IMPORTANT: SearXNG disables its JSON
// API (`search.formats`) by default as an anti-scraping measure — see the note in
// leadgen/docker-compose.yml for the settings.yml override needed before `findWebsite()` below
// will get anything but a 403. This is a known, documented SearXNG default, not a bug here.
//
// NOT LIVE-TESTED: no running SearXNG instance was available while writing this (no Docker
// daemon in this environment). The JSON response shape (`{ results: [{ url, title, content }] }`)
// matches SearXNG's documented `/search?format=json` output; verify against a real instance
// before relying on it in production.

import { politeFetch } from "./fetchPolite.ts";

const SEARXNG_BASE_URL = Deno.env.get("SEARXNG_BASE_URL") ?? "http://localhost:8082";

// Directory / social / listing sites that are never the "official website" of a lead, even if
// they rank first for a company name + city search. LinkedIn is explicitly included here and is
// never scraped by this adapter or any other part of this feature — only a generated search-link
// is ever produced for LinkedIn elsewhere in the pipeline (see leadSource.ts OwnerValidation /
// DECISIONS.md section 4).
const EXCLUDED_DOMAINS = [
  "krak.dk",
  "degulesider.dk",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "cvr.dk",
  "cvrapi.dk",
  "virk.dk",
  "proff.dk",
  "opendi.dk",
  "google.com",
  "goo.gl",
  "yelp.com",
  "trustpilot.com",
  "indeed.com",
  "jobindex.dk",
  "wikipedia.org",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tripadvisor.com",
];

interface SearxngResult {
  url: string;
  title?: string;
  content?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isExcluded(domain: string): boolean {
  return EXCLUDED_DOMAINS.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`));
}

// Rough name-similarity check so an unrelated page that happens to rank for the query (e.g. a
// news article mentioning the company) isn't returned as "the" official website.
function looksRelated(companyName: string, result: SearxngResult, domain: string): boolean {
  const normalizedName = companyName
    .toLowerCase()
    .replace(/[^a-zæøåäöü0-9\s]/g, "")
    .replace(/\b(a\/s|aps|i\/s|ivs)\b/g, "")
    .trim();
  const nameWords = normalizedName.split(/\s+/).filter((w) => w.length > 2);
  if (nameWords.length === 0) return true; // can't judge — don't block on an empty/short name

  const haystack = `${domain} ${result.title || ""} ${result.content || ""}`.toLowerCase();
  return nameWords.some((w) => haystack.includes(w));
}

/**
 * Resolve a company's likely official website via a self-hosted SearXNG instance. Returns null
 * if no confident, non-directory match is found — never guesses/returns a directory or social
 * media URL, and never scrapes LinkedIn.
 */
export async function findWebsite(companyName: string, city: string): Promise<string | null> {
  if (!companyName) return null;

  const query = city ? `${companyName} ${city}` : companyName;
  const searchUrl = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json`;

  try {
    const res = await politeFetch(searchUrl, {
      timeoutMs: 8000,
      skipRobotsCheck: true, // self-hosted instance we control
      ratePerSec: 3,
      bucketSize: 5,
    });
    if (!res.ok) {
      console.error("searxngSource: request failed:", res.status);
      return null;
    }
    const data: SearxngResponse = await res.json();
    const results = data.results || [];

    for (const result of results) {
      const domain = extractDomain(result.url);
      if (!domain) continue;
      if (isExcluded(domain)) continue;
      if (!looksRelated(companyName, result, domain)) continue;
      return `https://${domain}`;
    }

    return null;
  } catch (e) {
    console.error("searxngSource findWebsite error:", e);
    return null;
  }
}

// Exported for reuse/testing (e.g. by the Chat-agent's enrichment step, which may want to apply
// the same directory-site exclusion list when deciding whether a lead's existing `website` field
// is actually useful).
export const SEARXNG_EXCLUDED_DOMAINS = EXCLUDED_DOMAINS;
