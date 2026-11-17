// Site-wide SEO crawl for the autopilot (ported from ~/seo-autopilot/src/audit.ts).
// Pure parsing, checks and scoring; the network part takes an injected fetch and
// goes through the same SSRF guard as the on-page audit. No model is involved.
import { isPublicHttpUrl } from "./onpage.ts";

export type Severity = 'high' | 'medium' | 'low';
export type Finding = { severity: Severity; issue: string; fix: string };

export type PageAnalysis = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  h1Count: number;
  wordCount: number;
  jsonLdTypes: string[];
  internalLinks: number;
  hasOgImage: boolean;
};

// ---------------------------------------------------------------------------
// Sitemap parsing (pure, testable)
// ---------------------------------------------------------------------------

/** Parses sitemap XML into either page URLs (<urlset>) or child sitemap URLs (<sitemapindex>). */
export function parseSitemapXml(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s][^<]*)<\/loc>/gi)].map((m) => decodeEntities(m[1].trim()));
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

// ---------------------------------------------------------------------------
// HTML analysis (pure, testable)
// ---------------------------------------------------------------------------

export function emptyAnalysis(): PageAnalysis {
  return {
    title: null,
    metaDescription: null,
    canonical: null,
    robots: null,
    lang: null,
    h1Count: 0,
    wordCount: 0,
    jsonLdTypes: [],
    internalLinks: 0,
    hasOgImage: false,
  };
}

export function analyzeHtml(html: string, siteOrigin: string): PageAnalysis {
  const title = matchTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = matchMetaContent(html, 'description');
  const canonical = matchLinkHref(html, 'canonical');
  const robots = matchMetaContent(html, 'robots');
  const langMatch = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  const lang = langMatch ? langMatch[1].trim() || null : null;
  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  const wordCount = countWords(stripTags(html));
  const jsonLdTypes = extractJsonLdTypes(html);
  const internalLinks = countInternalLinks(html, siteOrigin);
  const hasOgImage =
    /<meta[^>]+property=["']og:image["'][^>]*content=["'][^"']+["']/i.test(html) ||
    /<meta[^>]+content=["'][^"']+["'][^>]*property=["']og:image["']/i.test(html);

  return { title, metaDescription, canonical, robots, lang, h1Count, wordCount, jsonLdTypes, internalLinks, hasOgImage };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function matchTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m) return null;
  const text = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  return text || null;
}

function matchMetaContent(html: string, name: string): string | null {
  const re1 = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  if (!m) return null;
  const text = decodeEntities(m[1]).trim();
  return text || null;
}

function matchLinkHref(html: string, rel: string): string | null {
  const re1 = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*href=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["']${rel}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  if (!m) return null;
  const text = m[1].trim();
  return text || null;
}

function stripTags(html: string): string {
  // Word count reflects visible body content, like a crawler reading the
  // page without running JS: drop <head> (title/meta aren't body text) and
  // any script/style left in the body.
  const withoutHead = html.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  const withoutScripts = withoutHead.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutTags);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function extractJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      collectJsonLdTypes(JSON.parse(block[1].trim()), types);
    } catch {
      // invalid JSON-LD block; skip it
    }
  }
  return [...types];
}

function collectJsonLdTypes(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj['@type'] === 'string') out.add(obj['@type']);
    else if (Array.isArray(obj['@type'])) for (const t of obj['@type']) if (typeof t === 'string') out.add(t);
    if (obj['@graph']) collectJsonLdTypes(obj['@graph'], out);
  }
}

function countInternalLinks(html: string, siteOrigin: string): number {
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  let count = 0;
  for (const href of hrefs) {
    if (href.startsWith('/') && !href.startsWith('//')) count++;
    else if (href.startsWith(siteOrigin)) count++;
  }
  return count;
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return u.replace(/\/+$/, '');
  }
}

// ---------------------------------------------------------------------------
// Deterministic findings + scoring (pure, testable)
// ---------------------------------------------------------------------------

export function findPageIssues(url: string, a: PageAnalysis, status: number): Finding[] {
  const issues: Finding[] = [];
  const add = (severity: Severity, issue: string, fix: string) => issues.push({ severity, issue, fix });

  if (status !== 200) {
    add(
      'high',
      `Siden svarer med status ${status || 'ingen forbindelse'}.`,
      'Undersøg hvorfor siden ikke returnerer 200 OK, og ret serverens svar eller omdirigering.'
    );
    return issues;
  }

  if (a.wordCount === 0) {
    add(
      'high',
      'Den rå HTML har 0 ord synlig tekst (typisk en SPA uden server-rendering).',
      'Tilføj server-side rendering eller prerendering, så crawlere ser indhold uden at køre JavaScript.'
    );
  }
  if (a.h1Count === 0) {
    add('high', 'Ingen <h1> fundet i den rå HTML.', 'Tilføj en synlig H1 i den rå HTML, eller aktiver prerendering.');
  } else if (a.h1Count > 1) {
    add('medium', `Flere <h1>-tags fundet (${a.h1Count}).`, 'Brug kun én <h1> pr. side.');
  }
  if (!a.title) {
    add('high', 'Siden har ingen <title>.', 'Tilføj en unik, beskrivende titel-tag.');
  } else if (a.title.length > 60) {
    add('low', `Titlen er lang (${a.title.length} tegn) og kan blive afskåret i søgeresultater.`, 'Hold titlen på ca. 50-60 tegn.');
  }
  if (!a.metaDescription) {
    add('medium', 'Siden har ingen meta description.', 'Tilføj en meta description på 50-160 tegn, der opsummerer sidens indhold.');
  } else if (a.metaDescription.length < 50 || a.metaDescription.length > 160) {
    add('low', `Meta description har en uhensigtsmæssig længde (${a.metaDescription.length} tegn).`, 'Hold meta description mellem 50 og 160 tegn.');
  }
  if (!a.canonical) {
    add('medium', 'Siden har ingen canonical-tag.', 'Tilføj <link rel="canonical"> med sidens egen URL.');
  } else if (normalizeUrl(a.canonical) !== normalizeUrl(url)) {
    add(
      'high',
      `Canonical peger på en anden URL (${a.canonical}) end siden selv.`,
      'Ret canonical, så den peger på sidens egen URL, med mindre det er en bevidst omdirigering af dupliceret indhold.'
    );
  }
  if (a.robots && /noindex/i.test(a.robots)) {
    add('high', `Siden er markeret noindex (robots: "${a.robots}").`, 'Fjern noindex, hvis siden skal kunne findes i søgeresultater.');
  }
  if (!a.lang) {
    add('low', 'Siden har intet lang-attribut på <html>.', 'Tilføj lang="da" (eller relevant sprogkode) på <html>-tagget.');
  }
  if (a.jsonLdTypes.length === 0) {
    add('medium', 'Ingen structured data (JSON-LD) fundet.', 'Tilføj relevant schema.org-markup, fx Organization, WebPage eller BreadcrumbList.');
  }
  if (!a.hasOgImage) {
    add('low', 'Siden har intet og:image.', 'Tilføj et Open Graph-billede, så links ser godt ud ved deling på sociale medier.');
  }
  if (a.internalLinks === 0) {
    add('medium', 'Ingen interne links fundet i den rå HTML.', 'Tilføj interne links i den rå HTML, så crawlere kan finde rundt på sitet uden JavaScript.');
  }

  return issues;
}

export function scorePage(issues: Finding[]): number {
  let score = 100;
  for (const issue of issues) score -= issue.severity === 'high' ? 10 : issue.severity === 'medium' ? 5 : 2;
  return Math.max(0, Math.min(100, score));
}

export function siteScoreFromPages(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export type PrevPageRow = {
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  robots: string | null;
  h1_count: number | null;
  word_count: number | null;
  score: number | null;
};

export function diffPageFields(prev: PrevPageRow, curr: PageAnalysis, currScore: number) {
  const changes: { field: string; before: string; after: string }[] = [];
  const cmp = (field: string, before: unknown, after: unknown) => {
    const b = before === null || before === undefined ? '' : String(before);
    const a = after === null || after === undefined ? '' : String(after);
    if (b !== a) changes.push({ field, before: b, after: a });
  };
  cmp('title', prev.title, curr.title);
  cmp('meta_description', prev.meta_description, curr.metaDescription);
  cmp('canonical', prev.canonical, curr.canonical);
  cmp('robots', prev.robots, curr.robots);
  cmp('h1_count', prev.h1_count, curr.h1Count);
  cmp('word_count', prev.word_count, curr.wordCount);
  cmp('score', prev.score, currScore);
  return changes;
}

// ---------------------------------------------------------------------------
// Crawl (network injected)
// ---------------------------------------------------------------------------

export interface CrawledPage { url: string; status: number; ms: number; bytes: number; analysis: PageAnalysis; issues: Finding[]; score: number }
export interface CrawlDeps { fetch: typeof fetch; now: () => number; userAgent?: string; timeoutMs?: number }

const MAX_BYTES = 2 * 1024 * 1024;

/** GET a public URL, following up to 5 redirects, each re-checked by the SSRF guard. Status 0 = no answer. */
export async function guardedGet(raw: string, deps: CrawlDeps): Promise<{ status: number; ms: number; bytes: number; body: string }> {
  const started = deps.now();
  let current = raw;
  for (let hop = 0; hop <= 5; hop++) {
    const check = isPublicHttpUrl(current);
    if (!check.ok) return { status: 0, ms: deps.now() - started, bytes: 0, body: "" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 20_000);
    try {
      const res = await deps.fetch(check.url.toString(), {
        redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": deps.userAgent ?? "GrowthOS-SEO-Autopilot/1.0 (+https://www.aiagencydanmark.dk)" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        current = new URL(res.headers.get("location")!, check.url).toString();
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) return { status: res.status, ms: deps.now() - started, bytes: buf.byteLength, body: "" };
      return { status: res.status, ms: deps.now() - started, bytes: buf.byteLength, body: new TextDecoder().decode(buf) };
    } catch {
      return { status: 0, ms: deps.now() - started, bytes: 0, body: "" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 0, ms: deps.now() - started, bytes: 0, body: "" };
}

/** Page URLs from /sitemap.xml (following sitemap indexes), limited to the site's own host. */
export async function discoverSitemapUrls(siteUrl: string, maxPages: number, deps: CrawlDeps): Promise<string[]> {
  const host = new URL(siteUrl).hostname;
  const queue = [`${siteUrl}/sitemap.xml`];
  const seen = new Set<string>();
  const pages: string[] = [];
  for (let guard = 0; queue.length && pages.length < maxPages && guard < 25; guard++) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await guardedGet(sm, deps);
    if (res.status !== 200 || !res.body) continue;
    const { urls, sitemaps } = parseSitemapXml(res.body);
    for (const u of urls) if (sameHost(u, host) && !pages.includes(u)) pages.push(u);
    for (const s of sitemaps) if (sameHost(s, host)) queue.push(s);
  }
  return pages.slice(0, maxPages);
}

function sameHost(u: string, host: string): boolean {
  try { return new URL(u).hostname === host; } catch { return false; }
}

export async function crawlSite(siteUrl: string, maxPages: number, deps: CrawlDeps): Promise<CrawledPage[]> {
  const origin = new URL(siteUrl).origin;
  const out: CrawledPage[] = [];
  for (const url of await discoverSitemapUrls(siteUrl, maxPages, deps)) {
    const res = await guardedGet(url, deps);
    const analysis = res.body ? analyzeHtml(res.body, origin) : emptyAnalysis();
    const issues = findPageIssues(url, analysis, res.status);
    out.push({ url, status: res.status, ms: res.ms, bytes: res.bytes, analysis, issues, score: scorePage(issues) });
  }
  return out;
}
