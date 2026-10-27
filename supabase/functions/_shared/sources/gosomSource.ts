// Self-hosted gosom/google-maps-scraper (MIT license, github.com/gosom/google-maps-scraper) —
// primary Google Maps source per DECISIONS.md section 2, replacing the paid Apify path
// (`searchGoogleMaps` in lead-generation-chat/index.ts) as the default. Apify stays available
// as an opt-in fallback behind APIFY_API_TOKEN, wired up by the Chat-agent.
//
// Runs via `leadgen/docker-compose.yml`'s `gosom` service in its web/job-API mode. This adapter
// submits a job per query, polls for completion, and downloads the results.
//
// INHERITED RISK (not solved here, just carried forward): gosom scrapes Google Maps, same as the
// existing Apify path. Scraping Google Maps carries Google ToS risk regardless of which tool
// does it — that risk existed before this change and is unchanged by swapping the implementation.
// See DECISIONS.md addendum.
//
// NOT LIVE-TESTED: no Docker daemon was available while writing this adapter, so the exact JSON
// field names of gosom's job-create/status/results endpoints were taken from its public
// README/OpenAPI docs (api/docs), not verified against a running container. The result mapper
// below defensively checks several plausible field-name variants (e.g. `phone` vs
// `phone_number`) and the CSV fallback path for exactly this reason. Smoke-test against a real
// gosom container before depending on this in production — see DECISIONS.md addendum for what to
// check first.

import type { LeadSource, RawLead } from "../leadSource.ts";
import { politeFetch } from "./fetchPolite.ts";

const GOSOM_BASE_URL = Deno.env.get("GOSOM_BASE_URL") ?? "http://localhost:8081";
const GOSOM_POLL_INTERVAL_MS = 3000;
const GOSOM_POLL_TIMEOUT_MS = 120000;

interface GosomJobResult {
  title?: string;
  name?: string;
  phone?: string;
  phone_number?: string;
  address?: string;
  complete_address?: { city?: string; postal_code?: string };
  city?: string;
  postal_code?: string;
  website?: string;
  categories?: string[];
  category?: string;
  rating?: number;
  review_count?: number;
  reviews?: number;
  latitude?: number;
  longitude?: number;
  link?: string;
  url?: string;
  cid?: string;
}

async function createJob(query: string, location: string, maxResults: number): Promise<string> {
  const keyword = location ? `${query} ${location}` : query;
  const payload = {
    name: `leadgen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    keywords: [keyword],
    lang: "da",
    zoom: 15,
    // gosom's "depth" is roughly a scroll-page count; approximate from desired result count.
    depth: Math.min(Math.max(Math.ceil(maxResults / 20), 1), 10),
    email: false,
    // gosom's API decodes max_time as a Go time.Duration, which encoding/json unmarshals from an
    // integer number of NANOSECONDS (not a "5m" string — that returns HTTP 422). 5 min = 300e9 ns.
    // Verified live against gosom/google-maps-scraper web mode (a "5m" string 422s; 300000000000 → 201).
    max_time: 5 * 60 * 1_000_000_000,
  };

  const res = await politeFetch(`${GOSOM_BASE_URL}/api/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    skipRobotsCheck: true, // self-hosted service we control, not a third-party site
    timeoutMs: 10000,
  });
  if (!res.ok) {
    throw new Error(`gosom job create failed: ${res.status} ${await safeText(res)}`);
  }
  const data = await res.json();
  const jobId = data?.id ?? data?.job_id ?? data?.data?.id;
  if (!jobId) throw new Error("gosom job create: no job id in response");
  return String(jobId);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function pollJob(
  jobId: string,
  onProgress?: (message: string, count: number) => void,
): Promise<GosomJobResult[]> {
  const start = Date.now();
  while (Date.now() - start < GOSOM_POLL_TIMEOUT_MS) {
    const res = await politeFetch(`${GOSOM_BASE_URL}/api/v1/jobs/${jobId}`, {
      skipRobotsCheck: true,
      timeoutMs: 8000,
    });
    if (res.ok) {
      const data = await res.json();
      // gosom's GET /jobs/:id returns PascalCase keys ("Status"), unlike its lowercase create
      // response ("id"). Reading only `status` left this permanently "" → the job never looked
      // done and always timed out. Verified live: a finished job reports {"Status":"ok"}.
      const status = String(data?.Status ?? data?.status ?? data?.data?.status ?? "").toLowerCase();
      onProgress?.(`Gosom job ${jobId}: ${status || "working"}...`, 0);
      if (["ok", "finished", "done", "completed", "success"].includes(status)) {
        return await downloadResults(jobId);
      }
      if (["failed", "error", "aborted"].includes(status)) {
        throw new Error(`gosom job ${jobId} failed (status=${status})`);
      }
    }
    await new Promise((r) => setTimeout(r, GOSOM_POLL_INTERVAL_MS));
  }
  throw new Error(`gosom job ${jobId} timed out after ${GOSOM_POLL_TIMEOUT_MS}ms`);
}

async function downloadResults(jobId: string): Promise<GosomJobResult[]> {
  // Prefer a JSON results response if gosom's download endpoint supports it via content
  // negotiation / query param; fall back to CSV parsing otherwise (gosom's documented default
  // export format is CSV).
  try {
    const jsonRes = await politeFetch(
      `${GOSOM_BASE_URL}/api/v1/jobs/${jobId}/download?format=json`,
      { skipRobotsCheck: true, timeoutMs: 15000 },
    );
    if (jsonRes.ok) {
      const contentType = jsonRes.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await jsonRes.json();
        return Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);
      }
    }
  } catch {
    // fall through to CSV
  }

  const csvRes = await politeFetch(`${GOSOM_BASE_URL}/api/v1/jobs/${jobId}/download`, {
    skipRobotsCheck: true,
    timeoutMs: 15000,
  });
  if (!csvRes.ok) throw new Error(`gosom download failed: ${csvRes.status}`);
  return parseGosomCsv(await csvRes.text());
}

// RFC4180-aware CSV parser. gosom's Google Maps export has commas AND double-quotes embedded in
// fields (addresses like "Vej 1, 8900 Randers", and whole JSON blobs in complete_address/about/
// reviews columns), so a naive line/comma split mis-aligns every row after the first comma-bearing
// field. This tokenizes properly: quoted fields may contain commas, newlines, and "" escapes.
function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++; // CRLF
      record.push(field); field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length > 0) { record.push(field); records.push(record); }
  return records;
}

function parseGosomCsv(csv: string): GosomJobResult[] {
  const records = parseCsvRecords(csv);
  if (records.length < 2) return [];
  const headers = records[0].map((h) => h.trim());
  return records.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return {
      title: row["title"] || row["name"],
      phone: row["phone"] || row["phone_number"],
      address: row["address"] || row["complete_address"],
      city: row["city"],
      postal_code: row["postal_code"],
      website: row["website"],
      category: row["category"] || row["categories"],
      // gosom's CSV column is `review_rating` (not `rating`); accept both.
      rating: row["review_rating"] || row["rating"]
        ? Number(row["review_rating"] || row["rating"])
        : undefined,
      review_count: row["review_count"] || row["reviews"]
        ? Number(row["review_count"] || row["reviews"])
        : undefined,
      latitude: row["latitude"] ? Number(row["latitude"]) : undefined,
      longitude: row["longitude"] ? Number(row["longitude"]) : undefined,
      link: row["link"] || row["url"],
      cid: row["cid"],
    } satisfies GosomJobResult;
  });
}

function mapGosomItem(item: GosomJobResult): RawLead | null {
  const name = item.title || item.name;
  if (!name) return null;

  const phone = (item.phone || item.phone_number || "").replace(/\s/g, "") || undefined;
  const city = item.city || item.complete_address?.city || undefined;
  const postnr = item.postal_code || item.complete_address?.postal_code || undefined;
  const industry = item.category || item.categories?.[0];
  const website = item.website || undefined;

  return {
    name,
    address: item.address || undefined,
    city,
    postnr,
    lat: item.latitude,
    lng: item.longitude,
    phone,
    phone_type: phone ? "unknown" : undefined,
    website,
    industry_text: industry,
    status: "Aktiv",
    rating: item.rating ?? null,
    review_count: item.review_count ?? item.reviews ?? undefined,
    google_maps_url: item.link || item.url,
    source: "Gosom",
    sources: ["Gosom"],
    source_details: {
      ...(phone ? { phone: "Gosom" as const } : {}),
      ...(item.address ? { address: "Gosom" as const } : {}),
      ...(website ? { website: "Gosom" as const } : {}),
    },
    fetched_at: new Date().toISOString(),
  };
}

export const gosomSource: LeadSource = {
  name: "Gosom",
  async search(params, onProgress) {
    const { queries, location, maxResults, signal } = params;
    const allResults: RawLead[] = [];

    for (const query of queries) {
      if (signal?.aborted || allResults.length >= maxResults) break;
      try {
        onProgress?.(
          `Submitting Gosom job for "${query}"${location ? ` i ${location}` : ""}...`,
          allResults.length,
        );
        const jobId = await createJob(query, location, maxResults);
        const items = await pollJob(jobId, onProgress);
        const mapped = items.map(mapGosomItem).filter((r): r is RawLead => r !== null);
        allResults.push(...mapped);
        onProgress?.(`Gosom: ${mapped.length} resultater for "${query}"`, allResults.length);
      } catch (e) {
        console.error("gosomSource search error:", e);
        // One failed job shouldn't kill the whole multi-query search.
      }
    }

    return allResults.slice(0, maxResults);
  },
};
