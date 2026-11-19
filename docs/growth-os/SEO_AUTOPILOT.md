# SEO autopilot (Growth OS)

Moved in from the standalone `~/seo-autopilot` service (Mac LaunchAgent plus its own Railway project).
It now runs inside the `growth-os` Railway service and stores everything in Supabase per company.

## What a round does
1. Crawls the site's `sitemap.xml`, up to 60 pages, own host only, through the SSRF guard. Each page is checked in its raw HTML: status, words, h1, title, meta description, canonical, robots, lang, JSON-LD, og:image and internal links. Each page gets a score of 100 minus 10, 5 or 2 per high, medium or low finding. Pages, findings and changed fields since the last crawl are stored. No model is used in this step.
2. Finishes the model review of any draft whose review was interrupted earlier.
3. If no task is open, a planner model picks 1–3 tasks (a technical audit or a page draft). If the model fails, a fixed plan is used instead.
4. A writer model drafts the top task and a reviewer model scores it from 1 to 10. **The score is not an approval.** Every draft waits in the approval queue until an owner or company_admin approves or rejects it with `growth_seo_decide_draft`. Approving does not publish anything.

## Models: free only (owner decision 2026-11-17)
- A model is used only if the live OpenRouter catalogue prices both prompt and completion at exactly 0. A response that reports a cost above 0 stops the round.
- Preferred models come from `GROWTH_OS_SEO_FREE_MODELS` (comma list). The newest other free models fill the rest, so a retired model is never called.
- There is a per-company cap: `growth_seo_sites.llm_calls_per_day` (default 12, max 40). The free tier on an account allows about 50 requests per day.
- If every free model answers 429, the task waits for the next round and does not lose an attempt. (In the old service this caused 57 of its failures.)

## Schedule and manual runs
- Every hour, the service runs each enabled site whose `crawl_every_hours` has passed (default 6).
- **Run a round now** on Growth OS → SEO autopilot queues a `seo.autopilot` task, at most once per hour.

## Setup and ownership
`growth_seo_configure_site` (owner/company_admin only) requires an **active** Search Console connection. The site must be covered by that property: a `sc-domain:` property covers the domain and its subdomains, while a URL-prefix property covers only its own host. This stops a company from pointing the crawler at someone else's site.

## Data
- Tables: `growth_seo_sites`, `_runs`, `_pages`, `_findings`, `_changes`, `_tasks`, `_drafts`, `_reports`.
- RLS: members read their own company's rows. Clients cannot write; the service role writes.
- `_reports` holds the old service's REA competitor reports and GA4 summaries as history. REA itself was not moved: it ran Claude Code and cost $10.62.

## History import
```bash
railway run node scripts/growth-os/import-seo-autopilot.mjs --db ~/seo-autopilot/data/seo-autopilot.db --company <uuid>
```
- The import can be re-run. Every row keeps its old id in `legacy_id`.
- Old "approved" drafts are imported as reviewer-passed with the human decision still pending, because no person ever approved them.

## Automatic publishing (migration 20261119120000)

The owner can let the autopilot publish its own articles: Growth OS → SEO autopilot → Approval queue → "Automatic publishing" (owner/company_admin only, `growth_seo_set_auto_publish`).

- **What may go live:** only `page` drafts written after the switch was turned on (never the imported backlog), with a reviewer score ≥ the chosen minimum (6–10, default 8), at most N per 24 h (0–5, default 1).
- **Content checks before publishing** (`seo/publish.ts`, no model): at least 400 words, no price other than 499 kr., no trial length, no links to other websites, no HTML code, a clean path. A draft that fails gets `publish_block_reason` and waits for a person.
- **Where:** articles live at `https://www.aiagencydanmark.dk/da/guide/<path>`. The agent cannot change any other page. The site reads them through `growth_seo_published_articles()` (public, read-only): in the browser at once, and as prerendered HTML plus sitemap entries at the next build.
- **Rebuild:** set `GROWTH_OS_SITE_DEPLOY_HOOK_URL` on the Railway service to a Vercel deploy hook (Vercel → project → Settings → Git → Deploy Hooks, branch `main`). The service calls it after anything was published or taken offline. Only `https://api.vercel.com/v1/integrations/deploy/...` URLs are accepted.
- **Human approval** of a page draft now publishes it too. **Take offline:** the "Take offline" button (`growth_seo_unpublish`). Every publish, block and unpublish is in `growth_audit_log`.
