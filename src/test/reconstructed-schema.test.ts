import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for B2: the 15 previously-orphaned production tables must stay
 * reproducible via the reconstruction migration, with RLS enabled and tenant
 * policies on the company-scoped ones.
 */
const MIG = join(process.cwd(), "supabase/migrations/20261021000001_reconstruct_orphaned_production_tables.sql");

const ALL15 = [
  "ai_conversations", "ai_messages", "ai_execution_runs", "ai_execution_steps",
  "call_sessions", "capability_usage", "integration_dna", "integration_opportunities",
  "phone_identities", "telephony_connections", "telnyx_config", "telnyx_credentials",
  "telnyx_webhook_events", "workspace_ai_preferences", "workspace_capabilities",
];
// company_id-bearing tables must have a tenant policy; these two have none → deny-all.
const NO_COMPANY = ["ai_execution_steps", "telnyx_webhook_events"];

describe("B2 reconstruction migration", () => {
  it("exists", () => {
    expect(existsSync(MIG), "reconstruction migration must exist").toBe(true);
  });

  const sql = existsSync(MIG) ? readFileSync(MIG, "utf8") : "";

  it("creates all 15 tables with RLS enabled", () => {
    for (const t of ALL15) {
      expect(sql, `create table ${t}`).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
      expect(sql, `enable RLS on ${t}`).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    }
  });

  it("applies the standard tenant policy to every company-scoped table", () => {
    for (const t of ALL15.filter((t) => !NO_COMPANY.includes(t))) {
      const policy = new RegExp(`create policy "[^"]*${t}[^"]*" on public\\.${t} for all[\\s\\S]*?get_user_company_id\\(auth\\.uid\\(\\)\\)`);
      expect(sql, `tenant policy on ${t}`).toMatch(policy);
    }
  });

  it("documents the non-company tables as deny-all (no silent open access)", () => {
    for (const t of NO_COMPANY) {
      // RLS enabled but intentionally no policy → deny-all until reviewed
      const hasPolicy = new RegExp(`create policy "[^"]*" on public\\.${t} `).test(sql);
      expect(hasPolicy, `${t} should have NO policy (deny-all) pending metadata review`).toBe(false);
    }
  });

  it("preserves existing production tables and their policies", () => {
    for (const table of ALL15) {
      expect(sql).toContain(`if to_regclass('public.${table}') is null then`);
    }
    expect(sql.match(/and user_id = auth.uid\(\)/g)).toHaveLength(4);
  });
});
