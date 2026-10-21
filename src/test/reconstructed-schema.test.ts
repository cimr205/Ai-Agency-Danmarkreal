import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for B2: the 15 previously-orphaned production tables must stay
 * reproducible via the reconstruction migration, with RLS enabled and tenant
 * policies on the company-scoped ones.
 */
const MIG = join(process.cwd(), "supabase/migrations/20261014000000_reconstruct_orphaned_production_tables.sql");

const ALL15 = [
  "ai_conversations", "ai_messages", "ai_execution_runs", "ai_execution_steps",
  "call_sessions", "capability_usage", "integration_dna", "integration_opportunities",
  "phone_identities", "telephony_connections", "telnyx_config", "telnyx_credentials",
  "telnyx_webhook_events", "workspace_ai_preferences", "workspace_capabilities",
];
// company_id-bearing tables must have a tenant policy; these two have none → deny-all.
const NO_COMPANY = ["ai_execution_steps", "telnyx_webhook_events"];
// ai_conversations/ai_messages get a SELECT policy named to match
// 20261014000004_scope_ai_conversations_to_owner.sql, which then tightens them to owner-scoped.
const OWNER_SELECT: Record<string, string> = {
  ai_conversations: "Members view own company conversations",
  ai_messages: "Members view own company messages",
};

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

  it("applies a company-scoped tenant policy to every company-scoped table", () => {
    for (const t of ALL15.filter((t) => !NO_COMPANY.includes(t))) {
      if (OWNER_SELECT[t]) {
        // SELECT policy named to match the later owner-scoping migration.
        const p = new RegExp(`create policy "${OWNER_SELECT[t]}" on public\\.${t} for select[\\s\\S]*?get_user_company_id\\(auth\\.uid\\(\\)\\)`);
        expect(sql, `owner-aligned policy on ${t}`).toMatch(p);
      } else {
        const p = new RegExp(`create policy "[^"]*${t}[^"]*" on public\\.${t} for all[\\s\\S]*?get_user_company_id\\(auth\\.uid\\(\\)\\)`);
        expect(sql, `tenant policy on ${t}`).toMatch(p);
      }
    }
  });

  it("documents the non-company tables as deny-all (no silent open access)", () => {
    for (const t of NO_COMPANY) {
      // RLS enabled but intentionally no policy → deny-all until reviewed
      const hasPolicy = new RegExp(`create policy "[^"]*" on public\\.${t} `).test(sql);
      expect(hasPolicy, `${t} should have NO policy (deny-all) pending metadata review`).toBe(false);
    }
  });
});
