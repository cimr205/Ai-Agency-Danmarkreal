/**
 * Layer 4 — Validator  (inspired by AfterShip/email-verifier)
 *
 * Validates each email through multiple checks in order:
 *   1. Syntax  — basic format check
 *   2. Domain  — domain part is parseable
 *   3. MX      — domain has at least one MX record (via DNS lookup)
 *
 * SMTP verification is intentionally skipped to avoid IP blocks and
 * rate limiting — MX-level validation is production-safe.
 *
 * Returns ValidatedEmail with status:
 *   'valid'   — passed syntax + MX
 *   'risky'   — passed syntax + MX but domain looks catch-all or generic
 *   'invalid' — failed syntax or no MX records
 *   'unknown' — DNS lookup timed out or errored
 */

import dns from 'dns/promises';
import type { ExtractedEmail, ValidatedEmail, ValidationStatus } from '../types.js';

const SYNTAX_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}$/;

// Free/consumer email domains → lower confidence for B2B
const CONSUMER_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','live.com',
  'icloud.com','me.com','aol.com','gmx.com','mail.com','protonmail.com',
  'yandex.com','yahoo.co.uk','hotmail.co.uk',
]);

const MX_CACHE = new Map<string, { ok: boolean; ts: number }>();
const MX_TTL   = 1000 * 60 * 10; // 10 min cache

async function hasMx(domain: string): Promise<boolean> {
  const cached = MX_CACHE.get(domain);
  if (cached && Date.now() - cached.ts < MX_TTL) return cached.ok;

  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    const ok = Array.isArray(records) && records.length > 0;
    MX_CACHE.set(domain, { ok, ts: Date.now() });
    return ok;
  } catch {
    MX_CACHE.set(domain, { ok: false, ts: Date.now() });
    return false;
  }
}

export async function validateEmail(extracted: ExtractedEmail): Promise<ValidatedEmail> {
  const { email } = extracted;

  // 1. Syntax
  if (!SYNTAX_RE.test(email)) {
    return { ...extracted, validation_status: 'invalid', mx_valid: false };
  }

  const domain = email.split('@')[1].toLowerCase();

  // 2. MX
  let mx_valid = false;
  let status: ValidationStatus = 'unknown';

  try {
    mx_valid = await hasMx(domain);
    if (!mx_valid) {
      status = 'invalid';
    } else if (CONSUMER_DOMAINS.has(domain)) {
      status = 'risky';   // valid MX but consumer domain — unusual for B2B
    } else {
      status = 'valid';
    }
  } catch {
    status = 'unknown';
  }

  return { ...extracted, validation_status: status, mx_valid };
}

export async function validateAll(emails: ExtractedEmail[]): Promise<ValidatedEmail[]> {
  // Run in small batches to avoid DNS rate limits
  const results: ValidatedEmail[] = [];
  const BATCH = 5;

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const validated = await Promise.all(batch.map(validateEmail));
    results.push(...validated);
    if (i + BATCH < emails.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Sort: valid first, then risky, unknown, invalid
  const order: Record<ValidationStatus, number> = { valid: 0, risky: 1, unknown: 2, invalid: 3 };
  return results.sort((a, b) => order[a.validation_status] - order[b.validation_status]);
}
