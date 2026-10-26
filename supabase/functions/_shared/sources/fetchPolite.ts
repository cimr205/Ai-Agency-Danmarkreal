// Shared outbound-fetch helper for all lead-source adapters (gosom, OSM/Overpass, SearXNG, and
// any future source). Enforces, per the mission compliance requirements:
//
//   #48 — an identifiable User-Agent on every outbound request, and respect for robots.txt
//   #26 — rate limiting / concurrency caps per domain
//
// This is intentionally lightweight (an in-memory token bucket + a minimal robots.txt parser),
// not enterprise-grade — matches the scope asked for. State is per-process/per-isolate (Deno
// edge function instance), which is fine for the "don't hammer a single domain" goal this exists
// for; it does not need to be a globally-coordinated rate limiter.

export const LEADGEN_USER_AGENT =
  "AI Agency Danmark LeadGen Bot (+contact: kontakt@aiagency.dk)";

interface DomainState {
  tokens: number;
  lastRefill: number;
  inFlight: number;
}

const DEFAULT_RATE_PER_SEC = 2; // token refill rate per second
const DEFAULT_BUCKET_SIZE = 4; // max burst
const DEFAULT_MAX_CONCURRENCY = 2; // simultaneous in-flight requests per domain
const SLOT_POLL_MS = 150;

const domainStates = new Map<string, DomainState>();
const robotsCache = new Map<string, { disallowed: string[]; fetchedAt: number }>();
const ROBOTS_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getDomain(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "unknown";
  }
}

function getState(domain: string): DomainState {
  let state = domainStates.get(domain);
  if (!state) {
    state = { tokens: DEFAULT_BUCKET_SIZE, lastRefill: Date.now(), inFlight: 0 };
    domainStates.set(domain, state);
  }
  return state;
}

async function waitForSlot(
  domain: string,
  opts: { ratePerSec?: number; bucketSize?: number; maxConcurrency?: number } = {},
): Promise<void> {
  const rate = opts.ratePerSec ?? DEFAULT_RATE_PER_SEC;
  const bucket = opts.bucketSize ?? DEFAULT_BUCKET_SIZE;
  const maxConcurrency = opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  // deno-lint-ignore no-constant-condition
  while (true) {
    const state = getState(domain);
    const now = Date.now();
    const elapsedSec = (now - state.lastRefill) / 1000;
    if (elapsedSec > 0) {
      state.tokens = Math.min(bucket, state.tokens + elapsedSec * rate);
      state.lastRefill = now;
    }
    if (state.tokens >= 1 && state.inFlight < maxConcurrency) {
      state.tokens -= 1;
      state.inFlight += 1;
      return;
    }
    await new Promise((r) => setTimeout(r, SLOT_POLL_MS));
  }
}

function releaseSlot(domain: string): void {
  const state = domainStates.get(domain);
  if (state) state.inFlight = Math.max(0, state.inFlight - 1);
}

// Minimal robots.txt check: fetches `/robots.txt` once per origin (cached for ROBOTS_TTL_MS),
// looks for Disallow rules under a User-agent block matching our bot token or "*", and blocks
// requests whose path starts with a disallowed prefix. This is intentionally conservative and
// simple — not a full robots.txt spec implementation (no wildcard/`$`/crawl-delay handling).
// If robots.txt is unreachable or absent, requests are allowed (fail-open), matching how most
// polite crawlers behave when a site simply has no robots.txt.
async function isAllowedByRobots(url: string): Promise<boolean> {
  let origin: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    pathname = parsed.pathname || "/";
  } catch {
    return true;
  }

  const cached = robotsCache.get(origin);
  let disallowed: string[];
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
    disallowed = cached.disallowed;
  } else {
    disallowed = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": LEADGEN_USER_AGENT },
      });
      if (res.ok) {
        disallowed = parseRobotsDisallow(await res.text(), LEADGEN_USER_AGENT);
      }
    } catch {
      // Unreachable robots.txt -> fail open.
    }
    robotsCache.set(origin, { disallowed, fetchedAt: Date.now() });
  }

  return !disallowed.some((rule) => rule.length > 0 && pathname.startsWith(rule));
}

function parseRobotsDisallow(text: string, userAgent: string): string[] {
  const botToken = userAgent.split(" ")[0].toLowerCase(); // e.g. "ai"
  let currentAgent = "";
  const specificDisallow: string[] = [];
  const wildcardDisallow: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sepIdx = line.indexOf(":");
    if (sepIdx === -1) continue;
    const key = line.slice(0, sepIdx).trim().toLowerCase();
    const value = line.slice(sepIdx + 1).trim();

    if (key === "user-agent") {
      currentAgent = value.toLowerCase();
      continue;
    }
    if (key === "disallow" && value) {
      if (currentAgent === "*") wildcardDisallow.push(value);
      else if (currentAgent.includes(botToken) || currentAgent.includes("leadgen")) {
        specificDisallow.push(value);
      }
    }
  }

  // A block specifically naming our bot takes precedence over the wildcard block, per the
  // robots.txt spec's "most specific user-agent wins" convention.
  return specificDisallow.length > 0 ? specificDisallow : wildcardDisallow;
}

export interface PoliteFetchOptions extends RequestInit {
  timeoutMs?: number;
  ratePerSec?: number;
  bucketSize?: number;
  maxConcurrency?: number;
  /** Skip the robots.txt check — use only for self-hosted services we control (gosom, SearXNG). */
  skipRobotsCheck?: boolean;
}

/**
 * The one function all source adapters should use for outbound HTTP calls to third-party hosts.
 * Applies an identifiable User-Agent, a robots.txt allow-check, and a per-domain token-bucket
 * rate limit + concurrency cap.
 */
export async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = 10000,
    ratePerSec,
    bucketSize,
    maxConcurrency,
    skipRobotsCheck,
    ...fetchOpts
  } = options;

  if (!skipRobotsCheck) {
    const allowed = await isAllowedByRobots(url);
    if (!allowed) {
      throw new Error(`politeFetch: blocked by robots.txt: ${url}`);
    }
  }

  const domain = getDomain(url);
  await waitForSlot(domain, { ratePerSec, bucketSize, maxConcurrency });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...fetchOpts,
        signal: fetchOpts.signal ?? controller.signal,
        headers: { "User-Agent": LEADGEN_USER_AGENT, ...(fetchOpts.headers || {}) },
      });
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    releaseSlot(domain);
  }
}
