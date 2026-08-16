/**
 * Layer 3 — Extractor  (inspired by web-scraping-tools/email-scraper)
 *
 * Scans crawled page HTML + text for emails using:
 *   1. regex on full HTML (catches obfuscated addresses)
 *   2. regex on visible text
 *   3. mailto: href values
 *
 * Then:
 *   - filters junk / spam addresses
 *   - deduplicates
 *   - scores each email by priority (high = decision-maker, low = generic)
 *   - returns the best candidate per domain
 */

import type { CrawledPage } from './crawler.js';
import type { ExtractedEmail, EmailPriority } from '../types.js';

// ── Regex ─────────────────────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}\b/g;

const MAILTO_RE = /href=["']mailto:([^"'?\s]+)/gi;

// ── Filters ───────────────────────────────────────────────────────────────────

const JUNK_RE = /^(no[-_]?reply|noreply|donotreply|do[-_]not[-_]reply|bounce|mailer-daemon|postmaster|abuse|spam|robot|wordpress|feedburner|@sentry\.|@amazonaws\.|@cloudflare\.|example\.|@example\.|test@|@test\.)/i;

function isJunk(email: string): boolean {
  return JUNK_RE.test(email) || email.length > 254;
}

// ── Priority scoring ──────────────────────────────────────────────────────────

const HIGH_LOCAL   = new Set(['owner','founder','ceo','cto','coo','director','partner','president','md','gm']);
const MEDIUM_LOCAL = new Set(['sales','hello','hej','business','office','team','booking','manager','hr']);
const LOW_LOCAL    = new Set(['info','contact','kontakt','support','help','service','webmaster','mail','post','admin','reception']);

function scorePriority(email: string): { priority: EmailPriority; score: number } {
  const local = email.split('@')[0].toLowerCase().replace(/[._\-+]/g, '');

  if (HIGH_LOCAL.has(local))   return { priority: 'high',   score: 90 };
  if (MEDIUM_LOCAL.has(local)) return { priority: 'medium', score: 60 };
  if (LOW_LOCAL.has(local))    return { priority: 'low',    score: 30 };

  // Looks like a personal name email (e.g. john.doe@, jsmith@) → high value
  if (/^[a-z]{2,}[._][a-z]{2,}$/.test(email.split('@')[0].toLowerCase())) {
    return { priority: 'high', score: 85 };
  }
  if (/^[a-z]{4,12}$/.test(email.split('@')[0].toLowerCase())) {
    return { priority: 'medium', score: 55 };
  }

  return { priority: 'low', score: 20 };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function extractEmails(pages: CrawledPage[]): ExtractedEmail[] {
  const seen  = new Set<string>();
  const found : ExtractedEmail[] = [];

  for (const page of pages) {
    const candidates = new Set<string>();

    // 1. mailto: links (most reliable)
    let m: RegExpExecArray | null;
    const mailtoRe = new RegExp(MAILTO_RE.source, 'gi');
    while ((m = mailtoRe.exec(page.html)) !== null) {
      candidates.add(m[1].trim().toLowerCase());
    }

    // 2. Raw email regex on full HTML
    const emailReHtml = new RegExp(EMAIL_RE.source, 'g');
    while ((m = emailReHtml.exec(page.html)) !== null) {
      candidates.add(m[0].trim().toLowerCase());
    }

    // 3. Visible text
    const emailReText = new RegExp(EMAIL_RE.source, 'g');
    while ((m = emailReText.exec(page.text)) !== null) {
      candidates.add(m[0].trim().toLowerCase());
    }

    for (const email of candidates) {
      if (isJunk(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);

      const { priority } = scorePriority(email);
      found.push({ email, source_page: page.url, priority });
    }
  }

  // Sort: high → medium → low, then alphabetically
  return found.sort((a, b) => {
    const order: Record<EmailPriority, number> = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority] || a.email.localeCompare(b.email);
  });
}

/** Pick the single best email from a list. */
export function bestEmail(emails: ExtractedEmail[]): ExtractedEmail | null {
  return emails[0] ?? null;
}
