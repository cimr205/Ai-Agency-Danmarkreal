import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the QA-1 defect: an unescaped apostrophe inside a
 * single-quoted SQL string literal (e.g. 'the customer's accounts') makes a
 * migration invalid and it fails on any fresh DB apply. Comments (-- …) are
 * exempt. Any match here means a migration will break a clean deploy.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function offendingLines(sql: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("--")) continue; // SQL comment — apostrophes are harmless
    // English possessive/contraction apostrophe followed by a letter, not doubled ('')
    if (/[A-Za-z]'(s|t|re|ll|ve|d|m)[ ,./)]/.test(raw) && !/''/.test(raw)) {
      out.push({ line: i + 1, text: raw.trim().slice(0, 100) });
    }
  }
  return out;
}

describe("migration SQL lint — unescaped apostrophes in string literals", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  it("has migration files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no migration contains an unescaped apostrophe in a non-comment string literal", () => {
    const offenders: Record<string, Array<{ line: number; text: string }>> = {};
    for (const f of files) {
      const hits = offendingLines(readFileSync(join(MIGRATIONS, f), "utf8"));
      if (hits.length) offenders[f] = hits;
    }
    expect(offenders, `Unescaped apostrophes (will break a fresh DB apply):\n${JSON.stringify(offenders, null, 2)}`).toEqual({});
  });
});
