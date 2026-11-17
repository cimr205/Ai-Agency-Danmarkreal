// onpage-seo-audit@1.0.0: deterministic checks over one public page.
// Pure functions + a guarded fetch; no DOM library (edge runtime has none).

export type CheckStatus = "pass" | "warn" | "fail";
export interface SeoCheck { id: string; status: CheckStatus; value: string | number | boolean | null; expected: string }
export interface PageFetch { url: string; finalUrl: string; status: number; contentType: string; bytes: number; ms: number; html: string }

const MAX_BYTES = 2 * 1024 * 1024;

/** Refuses hosts that must never be fetched from the server (SSRF guard, no DNS lookup). */
export function isPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "not a valid URL" }; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "only http(s)" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL" };
  if (url.port && !["80", "443"].includes(url.port)) return { ok: false, reason: "non-standard port" };
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa") || !h.includes(".") && !h.includes(":")) {
    return { ok: false, reason: "private host name" };
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) {
      return { ok: false, reason: "private or reserved IPv4" };
    }
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return { ok: false, reason: "private or mapped IPv6" };
  }
  return { ok: true, url };
}

export async function fetchPublicPage(raw: string, fetchFn: typeof fetch = fetch, now: () => number = Date.now): Promise<PageFetch> {
  let current = raw;
  const started = now();
  for (let hop = 0; hop <= 5; hop++) {
    const check = isPublicHttpUrl(current);
    if (!check.ok) throw new Error(`refused URL (${check.reason})`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetchFn(check.url.toString(), {
        redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": "GrowthOS-SEO-Audit/1.0 (+https://aiagencydanmark.dk)", Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`redirect ${res.status} without location`);
        current = new URL(loc, check.url).toString();
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(ct)) throw new Error(`not HTML (${ct || "no content-type"})`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new Error("page larger than 2 MB");
      return { url: raw, finalUrl: check.url.toString(), status: res.status, contentType: ct, bytes: buf.byteLength, ms: now() - started, html: new TextDecoder().decode(buf) };
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("fetch timed out after 15 s");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too many redirects");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim();

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function metaContent(html: string, key: string, keyAttr = "name"): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attr(tag, keyAttr) ?? "").toLowerCase() === key) return attr(tag, "content");
  }
  return null;
}

function linkHref(html: string, rel: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes(rel)) return attr(tag, "href");
  }
  return null;
}

function len(min: number, max: number, v: string | null): CheckStatus {
  if (!v) return "fail";
  return v.length >= min && v.length <= max ? "pass" : "warn";
}

export function auditHtml(html: string, pageUrl: string): SeoCheck[] {
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const titleM = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? decode(titleM[1]) : null;
  const desc = metaContent(html, "description");
  const h1s = body.match(/<h1\b[\s\S]*?<\/h1>/gi) ?? [];
  const canonical = linkHref(html, "canonical");
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const lang = attr(htmlTag, "lang");
  const viewport = metaContent(html, "viewport");
  const robots = (metaContent(html, "robots") ?? "").toLowerCase();
  const imgs = body.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgs.filter((t) => attr(t, "alt") !== null).length;
  const base = new URL(pageUrl);
  let internal = 0, external = 0;
  for (const a of body.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(a, "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try { (new URL(href, base).host === base.host ? internal++ : external++); } catch { /* ignore bad href */ }
  }
  const ogTitle = metaContent(html, "og:title", "property");
  const ogDesc = metaContent(html, "og:description", "property");
  const jsonLd = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  const text = decode(body.replace(/<[^>]+>/g, " "));
  const words = text ? text.split(" ").filter((w) => /\p{L}/u.test(w)).length : 0;
  let canonicalAbs: boolean | null = null;
  if (canonical) { try { canonicalAbs = /^https?:\/\//i.test(canonical) && !!new URL(canonical); } catch { canonicalAbs = false; } }

  return [
    { id: "title", status: len(15, 65, title), value: title, expected: "present, 15–65 characters" },
    { id: "meta_description", status: len(50, 160, desc), value: desc, expected: "present, 50–160 characters" },
    { id: "h1_count", status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn", value: h1s.length, expected: "exactly 1" },
    { id: "canonical", status: canonical ? (canonicalAbs ? "pass" : "warn") : "warn", value: canonical, expected: "present and absolute" },
    { id: "html_lang", status: lang ? "pass" : "fail", value: lang, expected: "lang attribute on <html>" },
    { id: "viewport", status: viewport && /width=device-width/i.test(viewport) ? "pass" : "fail", value: viewport, expected: "width=device-width" },
    { id: "indexable", status: /noindex/.test(robots) ? "fail" : "pass", value: robots || null, expected: "no noindex" },
    { id: "img_alt_coverage", status: imgs.length === 0 || withAlt === imgs.length ? "pass" : withAlt / imgs.length >= 0.8 ? "warn" : "fail", value: imgs.length ? Math.round((withAlt / imgs.length) * 100) / 100 : null, expected: "every <img> has alt" },
    { id: "internal_links", status: internal >= 3 ? "pass" : internal >= 1 ? "warn" : "fail", value: internal, expected: "≥ 3 internal links" },
    { id: "external_links", status: "pass", value: external, expected: "informational" },
    { id: "open_graph", status: ogTitle && ogDesc ? "pass" : ogTitle || ogDesc ? "warn" : "fail", value: !!(ogTitle && ogDesc), expected: "og:title and og:description" },
    { id: "structured_data", status: jsonLd ? "pass" : "warn", value: jsonLd, expected: "JSON-LD present" },
    { id: "word_count", status: words >= 300 ? "pass" : words >= 150 ? "warn" : "fail", value: words, expected: "≥ 300 words of text" },
  ];
}

/** Deterministic score: passed checks / scored checks (informational ones excluded). */
export function auditScore(checks: SeoCheck[]): number {
  const scored = checks.filter((c) => c.id !== "external_links");
  return Math.round((scored.filter((c) => c.status === "pass").length / scored.length) * 1000) / 1000;
}
