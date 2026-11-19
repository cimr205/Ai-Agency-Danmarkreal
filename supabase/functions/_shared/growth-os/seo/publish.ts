// SEO autopilot: automatic publishing (migration 20261119120000).
//
// Runs on every hourly check of the Growth OS service, for each enabled site:
//   1. autoPublish: when the owner switched auto-publish on, publish the best
//      reviewed article drafts written since then, up to max_publish_per_day,
//      after deterministic content checks (contentBlockReason);
//   2. syncDeploy: when anything was published or unpublished since the last
//      site build, call the site's deploy hook so the static pages and the
//      sitemap are rebuilt. Without a hook the articles are still live (the
//      site loads them at runtime); only the prerendered HTML waits for the
//      next deploy.
// The agent can only add or remove its own articles under /da/guide/; it has
// no access to any other page of the website.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface PublishSite {
  company_id: string; site_url: string; auto_publish: boolean; auto_publish_since: string | null;
  publish_min_score: number; max_publish_per_day: number; last_deploy_requested_at: string | null;
}
interface Candidate { id: string; slug: string | null; title: string; meta_description: string | null; h1: string | null; body: string; review_score: number | null }

export const SLUG_RE = /^\/[a-z0-9\-/]{1,120}$/;
export const MIN_PUBLISH_WORDS = 400;
/** The only price the product has (product facts); any other amount is invented. */
const ALLOWED_PRICE = "499";

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Why a draft must not go live by itself, or null when it may. Deterministic, no model. */
export function contentBlockReason(d: Pick<Candidate, "slug" | "title" | "body">, siteHost: string): string | null {
  if (!d.slug || !SLUG_RE.test(d.slug) || d.slug.includes("//")) return "ugyldig sti";
  if (!d.title.trim()) return "mangler titel";
  if (words(d.body) < MIN_PUBLISH_WORDS) return `for kort (${words(d.body)} ord, mindst ${MIN_PUBLISH_WORDS})`;
  if (/<\s*(script|iframe|object|embed|form|style)\b/i.test(d.body)) return "indeholder HTML-kode";
  // Prices: only 499 kr. is a real price; anything else was invented by the model.
  for (const m of d.body.matchAll(/(\d[\d.,]*)\s*(?:kr\b|kr\.|dkk\b|kroner\b|€|eur\b|euro\b|usd\b)|(?:€|\$|usd\s*)\s*(\d[\d.,]*)/gi)) {
    const amount = (m[1] ?? m[2] ?? "").replace(/[.,]+$/, "");
    if (amount !== ALLOWED_PRICE) return `nævner en pris, der ikke er i produktfakta (${m[0].trim()})`;
  }
  // The product facts deliberately give no trial length.
  if (/\d+\s*(?:-\s*)?dage?s?\b[^.\n]{0,40}(?:prøve|gratis|trial)|prøveperiode[^.\n]{0,20}\d+\s*dage/i.test(d.body)) return "nævner en bestemt længde på prøveperioden";
  // Links may only point at this site (relative or same host).
  for (const m of d.body.matchAll(/https?:\/\/[^\s)\]>"']+/gi)) {
    let host = "";
    try { host = new URL(m[0]).hostname; } catch { return "ugyldigt link"; }
    if (host !== siteHost && host !== siteHost.replace(/^www\./, "") && `www.${host}` !== siteHost) return `linker til et andet website (${host})`;
  }
  return null;
}

/** Publishes up to the daily quota of qualifying drafts. Returns the published titles. */
export async function autoPublish(db: Db, site: PublishSite, nowMs: number): Promise<string[]> {
  if (!site.auto_publish || !site.auto_publish_since || site.max_publish_per_day <= 0) return [];
  const now = new Date(nowMs).toISOString();
  const { count, error: countErr } = await db.from("growth_seo_drafts").select("id", { count: "exact", head: true })
    .eq("company_id", site.company_id).eq("published_by", "autopilot").gte("published_at", new Date(nowMs - 86_400_000).toISOString());
  if (countErr) throw new Error(`publish quota: ${countErr.message}`);
  let left = site.max_publish_per_day - (count ?? 0);
  if (left <= 0) return [];

  const { data, error } = await db.from("growth_seo_drafts").select("id, slug, title, meta_description, h1, body, review_score")
    .eq("company_id", site.company_id).eq("kind", "page").eq("review_status", "passed").eq("decision", "pending")
    .is("published_at", null).is("legacy_id", null).is("publish_block_reason", null)
    .gte("review_score", site.publish_min_score).gte("created_at", site.auto_publish_since)
    .order("review_score", { ascending: false }).order("created_at").limit(10);
  if (error) throw new Error(`publish candidates: ${error.message}`);

  const host = new URL(site.site_url).hostname;
  const published: string[] = [];
  for (const d of (data ?? []) as Candidate[]) {
    if (left <= 0) break;
    let reason = contentBlockReason(d, host);
    if (!reason) {
      const { count: live } = await db.from("growth_seo_drafts").select("id", { count: "exact", head: true })
        .eq("company_id", site.company_id).eq("slug", d.slug).not("published_at", "is", null).is("unpublished_at", null);
      if ((live ?? 0) > 0) reason = "der er allerede en udgivet side på samme sti";
    }
    if (reason) {
      await db.from("growth_seo_drafts").update({ publish_block_reason: reason }).eq("id", d.id).eq("company_id", site.company_id);
      await audit(db, site.company_id, "seo_draft.publish_blocked", d, { reason });
      continue;
    }
    const { error: upErr } = await db.from("growth_seo_drafts").update({
      decision: "approved", decided_at: now, decision_note: `Udgivet automatisk af SEO-autopiloten (review-score ${d.review_score}).`,
      published_at: now, published_by: "autopilot",
    }).eq("id", d.id).eq("company_id", site.company_id).eq("decision", "pending").is("published_at", null);
    if (upErr) throw new Error(`publish: ${upErr.message}`);
    await audit(db, site.company_id, "seo_draft.published", d, { review_score: d.review_score, by: "autopilot" });
    published.push(d.title);
    left--;
  }
  return published;
}

async function audit(db: Db, company: string, event: string, d: Pick<Candidate, "id" | "slug" | "title">, extra: Record<string, unknown>) {
  await db.from("growth_audit_log").insert({ company_id: company, actor_type: "agent", actor_id: "seo-agent", event, subject_id: d.id, detail: { slug: d.slug, title: d.title, ...extra } });
}

/** Only a Vercel deploy hook is accepted as the rebuild target. */
export function validDeployHook(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname === "api.vercel.com" && u.pathname.startsWith("/v1/integrations/deploy/") ? u.toString() : null;
  } catch { return null; }
}

/** Rebuilds the site when articles changed since the last requested build. Returns true when a build was requested. */
export async function syncDeploy(db: Db, site: PublishSite, deps: { fetch: typeof fetch; now: () => number }, hook: string | null): Promise<boolean> {
  if (!hook) return false;
  const latest = async (col: "published_at" | "unpublished_at") => {
    const { data, error } = await db.from("growth_seo_drafts").select(col).eq("company_id", site.company_id).not(col, "is", null)
      .order(col, { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`deploy check: ${error.message}`);
    return (data as Record<string, string> | null)?.[col] ?? null;
  };
  const changed = [await latest("published_at"), await latest("unpublished_at")].filter((x): x is string => !!x).map(Date.parse);
  if (!changed.length) return false;
  const last = site.last_deploy_requested_at ? Date.parse(site.last_deploy_requested_at) : 0;
  if (Math.max(...changed) <= last) return false;
  const res = await deps.fetch(hook, { method: "POST" });
  if (!res.ok) throw new Error(`deploy hook: HTTP ${res.status}`);
  await db.from("growth_seo_sites").update({ last_deploy_requested_at: new Date(deps.now()).toISOString() }).eq("company_id", site.company_id);
  return true;
}
