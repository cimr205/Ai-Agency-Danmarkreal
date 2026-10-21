import { describe, it, expect } from "vitest";
import {
  assertNonProduction,
  loadTestEnv,
  ProductionGuardError,
  isTestEmail,
  isTestCompanyName,
  testEmail,
  testCompanyName,
} from "@/mastra/e2e/testenv";
import {
  provisionTwoTenants,
  cleanupTestData,
  type ProvisionPort,
} from "@/mastra/e2e/provision";

const SAFE_ENV = {
  TEST_SUPABASE_URL: "https://test-proj.supabase.co",
  TEST_SUPABASE_ANON_KEY: "anon",
  TEST_SUPABASE_SERVICE_ROLE_KEY: "service",
  E2E_ALLOW_TEST_PROJECT: "1",
};

describe("production guard", () => {
  it("refuses when required test vars are missing", () => {
    expect(() => loadTestEnv({})).toThrow(ProductionGuardError);
  });

  it("refuses when the test URL equals the production URL", () => {
    expect(() =>
      loadTestEnv({ ...SAFE_ENV, TEST_SUPABASE_URL: "https://prod.supabase.co", VITE_SUPABASE_URL: "https://prod.supabase.co" }),
    ).toThrow(/production/i);
  });

  it("refuses when the test URL contains the production project id", () => {
    expect(() =>
      assertNonProduction("https://abcprodref.supabase.co", { VITE_SUPABASE_PROJECT_ID: "abcprodref", E2E_ALLOW_TEST_PROJECT: "1" }),
    ).toThrow(/production project id/i);
  });

  it("refuses unless E2E_ALLOW_TEST_PROJECT is explicitly set", () => {
    expect(() => loadTestEnv({ ...SAFE_ENV, E2E_ALLOW_TEST_PROJECT: undefined })).toThrow(/E2E_ALLOW_TEST_PROJECT/);
  });

  it("accepts a clearly non-production, acknowledged test project", () => {
    const cfg = loadTestEnv(SAFE_ENV);
    expect(cfg.url).toBe("https://test-proj.supabase.co");
  });
});

describe("markers", () => {
  it("tags and recognizes test emails and company names", () => {
    expect(isTestEmail(testEmail("owner"))).toBe(true);
    expect(isTestEmail("real.user@aiagencydanmark.dk")).toBe(false);
    expect(isTestCompanyName(testCompanyName("Company A"))).toBe(true);
    expect(isTestCompanyName("Novo Nordisk")).toBe(false);
  });
});

// ───────── fake port ─────────
function fakePort() {
  let seq = 0;
  const inserts: Array<{ table: string; row: Record<string, unknown>; id: string }> = [];
  const updates: Array<{ table: string; matchValue: string; row: Record<string, unknown> }> = [];
  const users: Array<{ id: string; email: string }> = [];
  const deleted: Array<{ table: string; column: string; value: string }> = [];
  const port: ProvisionPort = {
    async createConfirmedUser(email) { const id = `u${++seq}`; users.push({ id, email }); return { id }; },
    async insert(table, row) { const id = `${table}-${++seq}`; inserts.push({ table, row, id }); return { id }; },
    async update(table, _col, matchValue, row) { updates.push({ table, matchValue, row }); },
    async rpc() {},
    async selectWhere(table, col, value) {
      if (table === "profiles" && col === "company_id") {
        return updates.filter((u) => u.table === "profiles" && (u.row as any).company_id === value).map((u) => ({ user_id: u.matchValue }));
      }
      return [];
    },
    async selectAll(table) {
      if (table === "companies") return inserts.filter((i) => i.table === "companies").map((i) => ({ id: i.id, name: i.row.name }));
      return [];
    },
    async deleteWhere(table, column, value) {
      deleted.push({ table, column, value });
      // simulate: one row per child table per company, one company per id delete
      return table === "companies" ? 1 : 1;
    },
    async listAuthUsers() { return users.slice(); },
    async deleteAuthUser(id) { const i = users.findIndex((u) => u.id === id); if (i >= 0) users.splice(i, 1); },
  };
  return { port, inserts, updates, users, deleted };
}

describe("provisionTwoTenants", () => {
  it("creates two companies with confirmed users, profiles, roles and seed records", async () => {
    const { port, inserts, updates, users } = fakePort();
    const { a, b } = await provisionTwoTenants(port, "draft_approval", "off");

    expect(a.companyId).not.toBe(b.companyId);
    expect(a.mode).toBe("draft_approval");
    expect(b.mode).toBe("off");
    // 2 users each, all on the test email domain
    expect(a.users).toHaveLength(2);
    expect(b.users).toHaveLength(2);
    expect(users.every((u) => isTestEmail(u.email))).toBe(true);
    // roles distinct per spec
    expect(a.users.map((u) => u.role).sort()).toEqual(["employee", "owner"]);
    expect(b.users.map((u) => u.role).sort()).toEqual(["employee", "manager"]);
    // each company: 1 company + 2 profiles + 2 roles + 2 leads + 2 deals + 2 tasks
    const companyRows = inserts.filter((i) => i.table === "companies");
    expect(companyRows).toHaveLength(2);
    expect(companyRows.every((i) => isTestCompanyName(i.row.name as string))).toBe(true);
    // profiles + user_roles are UPDATEd (trigger pre-creates them), not inserted
    expect(updates.filter((u) => u.table === "profiles")).toHaveLength(4);
    expect(updates.filter((u) => u.table === "user_roles")).toHaveLength(4);
    // user_roles has no company_id in the real schema → role set, company_id absent
    expect(updates.filter((u) => u.table === "user_roles").every((u) => "role" in u.row && !("company_id" in u.row))).toBe(true);
    expect(updates.filter((u) => u.table === "profiles").every((u) => "company_id" in u.row)).toBe(true);
    expect(inserts.filter((i) => i.table === "leads")).toHaveLength(4);
    // records are tagged to their company
    expect(a.recordIds.leads).toHaveLength(2);
  });
});

describe("cleanupTestData", () => {
  it("deletes ONLY marker-tagged companies + their children + test-domain users", async () => {
    const { port, deleted } = fakePort();
    await provisionTwoTenants(port, "off", "off");
    const counts = await cleanupTestData(port);

    // two marked companies removed
    expect(counts["companies"]).toBe(2);
    // child tables were scoped by company_id
    expect(deleted.filter((d) => d.table === "leads" && d.column === "company_id").length).toBe(2);
    expect(deleted.some((d) => d.table === "profiles" && d.column === "company_id")).toBe(true);
    // user_roles (no company_id) removed by user_id — 4 test users
    expect(deleted.filter((d) => d.table === "user_roles" && d.column === "user_id").length).toBe(4);
    // 4 test users removed
    expect(counts["auth.users"]).toBe(4);
    // never deletes by anything other than id / company_id / user_id (all tenant-safe keys)
    expect(deleted.every((d) => ["company_id", "id", "user_id"].includes(d.column))).toBe(true);
  });

  it("does not delete untagged companies", async () => {
    const { port, deleted } = fakePort();
    // inject an untagged company directly
    await port.insert("companies", { name: "Real Customer A/S" });
    const counts = await cleanupTestData(port);
    expect(counts["companies"] ?? 0).toBe(0);
    expect(deleted).toHaveLength(0);
  });
});
