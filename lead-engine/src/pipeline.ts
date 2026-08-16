/**
 * pipeline.ts — Orchestrates the full 4-layer lead generation flow:
 *
 *  Bruger vælger niche + land
 *    ↓
 *  Layer 1 · discovery.ts   — Google Maps → companies + websites
 *    ↓
 *  Layer 2 · crawler.ts     — Crawlee deep-crawls each website
 *    ↓
 *  Layer 3 · extractor.ts   — extracts + scores all emails per domain
 *    ↓
 *  Layer 4 · validator.ts   — MX validation, filters invalid/risky
 *    ↓
 *  Structured leads saved to SQLite
 *
 * Progress is emitted via a callback so the API layer can write it to the DB.
 */

import { randomUUID } from 'crypto';
import { URL } from 'url';
import type { SessionFilters, Lead } from './types.js';
import { discoverCompanies }        from './layers/discovery.js';
import { crawlWebsites }            from './layers/crawler.js';
import { extractEmails, bestEmail } from './layers/extractor.js';
import { validateAll }              from './layers/validator.js';

export type ProgressCallback = (pct: number, label: string) => void | Promise<void>;

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function buildQuery(query: string, filters: SessionFilters): string {
  const parts = [query];
  if (filters.city)    parts.push(`in ${filters.city}`);
  if (filters.country) parts.push(filters.country);
  return parts.join(' ');
}

function calcLeadScore(lead: Omit<Lead, 'lead_score'>): number {
  let score = 0;
  if (lead.email)                                  score += 30;
  if (lead.validation_status === 'valid')          score += 20;
  if (lead.validation_status === 'risky')          score += 10;
  if (lead.phone)                                  score += 15;
  if (lead.website)                                score += 10;
  if (lead.address)                                score += 5;
  if (lead.active_status === 'active_likely')      score += 10;
  if (lead.email && lead.email.includes('@' + lead.domain)) score += 10;
  return Math.min(100, score);
}

export async function runPipeline(
  sessionId  : string,
  query      : string,
  filters    : SessionFilters,
  onProgress : ProgressCallback,
): Promise<Lead[]> {

  const fullQuery = buildQuery(query, filters);
  const minLeads  = filters.min_leads ?? 20;
  const country   = filters.country ?? '';
  const niche     = filters.niche ?? query;

  // ── Layer 1: Discovery ────────────────────────────────────────────────────
  await onProgress(5, `Discovering companies on Google Maps for "${fullQuery}"…`);
  const companies = await discoverCompanies(fullQuery, minLeads);
  console.log(`[pipeline] discovered ${companies.length} companies`);
  await onProgress(25, `Found ${companies.length} companies. Starting deep crawl…`);

  // ── Filter companies ──────────────────────────────────────────────────────
  let filtered = companies;
  if (filters.must_have_website) filtered = filtered.filter(c => !!c.website);
  if (filters.exclude_keywords) {
    const excl = filters.exclude_keywords.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    filtered = filtered.filter(c => !excl.some(kw => c.company_name.toLowerCase().includes(kw)));
  }

  const websites = [...new Set(filtered.map(c => c.website).filter(Boolean))];

  // ── Layer 2: Crawl ────────────────────────────────────────────────────────
  await onProgress(30, `Crawling ${websites.length} websites for contact pages…`);
  const crawledMap = await crawlWebsites(websites);
  await onProgress(60, `Crawling done. Extracting emails…`);

  // ── Layer 3 + 4: Extract & Validate ──────────────────────────────────────
  const leads: Lead[] = [];
  const domainsSeen   = new Set<string>();

  let i = 0;
  for (const company of filtered) {
    i++;
    const dm    = domain(company.website);
    const pages = crawledMap.get(dm) ?? [];

    // Extract emails from all crawled pages for this domain
    const allEmails = extractEmails(pages);

    // Validate
    const validated = await validateAll(
      allEmails.filter(e => e.validation_status !== 'invalid') as typeof allEmails
    );

    // Pick best — skip truly invalid, keep valid + risky
    const usable  = validated.filter(v => v.validation_status !== 'invalid');
    const topEmail = usable[0] ?? null;

    if (filters.must_have_email && !topEmail) continue;
    if (filters.must_have_phone && !company.phone) continue;

    const key = dm || company.company_name;
    if (domainsSeen.has(key)) continue;
    domainsSeen.add(key);

    const lead: Omit<Lead, 'lead_score'> = {
      id               : randomUUID(),
      session_id       : sessionId,
      company_name     : company.company_name,
      website          : company.website,
      domain           : dm,
      email            : topEmail?.email ?? '',
      email_status     : topEmail?.validation_status === 'valid'  ? 'verified'
                       : topEmail?.validation_status === 'risky'  ? 'likely_valid'
                       : topEmail                                  ? 'unverified'
                       : 'missing',
      validation_status: topEmail?.validation_status ?? 'unknown',
      source_page      : topEmail?.source_page ?? '',
      phone            : company.phone,
      address          : company.address,
      city             : filters.city ?? '',
      country,
      niche,
      active_status    : company.website ? 'active_likely' : 'uncertain',
      imported         : false,
      imported_lead_id : '',
      scraped_at       : new Date().toISOString(),
    };

    const finalLead: Lead = { ...lead, lead_score: calcLeadScore(lead) };

    if (filters.score_threshold && finalLead.lead_score < filters.score_threshold) continue;

    leads.push(finalLead);

    const pct = 60 + Math.round((i / filtered.length) * 30);
    await onProgress(pct, `Processed ${i}/${filtered.length} companies…`);
  }

  // Sort: best score first
  leads.sort((a, b) => b.lead_score - a.lead_score);

  await onProgress(100, `Done — ${leads.length} leads ready`);
  return leads;
}
