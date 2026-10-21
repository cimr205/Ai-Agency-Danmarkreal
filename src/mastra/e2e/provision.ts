/// <reference types="node" />
/**
 * Two-tenant provisioning + marker-scoped cleanup for the Mastra E2E (QA-1).
 *
 * All DB/Auth effects go through a small {@link ProvisionPort} so the logic is
 * unit-testable with a fake port (no DB, no creds). `supabasePort()` adapts it
 * over a real service-role supabase-js client — and is only ever built by the
 * runner scripts after {@link loadTestEnv} passes the production guard.
 *
 * Cleanup deletes ONLY resources that carry the E2E marker (company name prefix
 * / test email domain) — never arbitrary rows.
 */
import {
  buildCompanyRow,
  buildProfileUpdate,
  buildUserRoleUpdate,
  buildLeadRow,
  buildDealRow,
  buildTaskRow,
  isTestCompanyName,
  isTestEmail,
  testEmail,
  type TenantSpec,
} from "./testenv.ts";

/** Narrow capability port — everything the provisioning needs, nothing more. */
export interface ProvisionPort {
  createConfirmedUser(email: string, password: string, fullName: string): Promise<{ id: string }>;
  insert(table: string, row: Record<string, unknown>): Promise<{ id: string }>;
  update(table: string, matchColumn: string, matchValue: string, row: Record<string, unknown>): Promise<void>;
  rpc(fn: string, args: Record<string, unknown>): Promise<void>;
  /** Returns rows (selected cols) where column === value. */
  selectWhere(table: string, column: string, value: string, cols?: string): Promise<Array<Record<string, unknown>>>;
  /** Returns all rows (selected cols) of a table. */
  selectAll(table: string, cols?: string): Promise<Array<Record<string, unknown>>>;
  deleteWhere(table: string, column: string, value: string): Promise<number>;
  listAuthUsers(): Promise<Array<{ id: string; email?: string }>>;
  deleteAuthUser(id: string): Promise<void>;
}

export interface ProvisionedUser { key: string; userId: string; email: string; role: string }
export interface ProvisionedTenant {
  label: string;
  companyId: string;
  mode: string;
  users: ProvisionedUser[];
  recordIds: { leads: string[]; deals: string[]; tasks: string[] };
}

/** Password for every E2E user — only ever used on the dedicated test project. */
export const TEST_PASSWORD = "E2e-Test-Pw-9f3!";

/** Create one tenant: company + users (roles) + seed records. */
export async function provisionTenant(port: ProvisionPort, spec: TenantSpec): Promise<ProvisionedTenant> {
  const company = await port.insert("companies", buildCompanyRow(spec.label, spec.mode));
  const companyId = company.id;

  const users: ProvisionedUser[] = [];
  for (const u of spec.users) {
    const email = testEmail(`${spec.label}-${u.key}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    const created = await port.createConfirmedUser(email, TEST_PASSWORD, u.fullName);
    // A DB trigger (handle_new_user) already created a `profiles` row and a default
    // `user_roles` ('employee') on user creation — so UPDATE to attach the company +
    // intended role rather than INSERT (which would violate unique keys).
    await port.update("profiles", "user_id", created.id, buildProfileUpdate(companyId, u.fullName));
    await port.update("user_roles", "user_id", created.id, buildUserRoleUpdate(u.role));
    users.push({ key: u.key, userId: created.id, email, role: u.role });
  }

  // Seed records need a creator (deals/tasks require created_by) — use the first user.
  const createdBy = users[0].userId;
  const leads: string[] = [];
  const deals: string[] = [];
  const tasks: string[] = [];
  for (let i = 1; i <= 2; i++) {
    leads.push((await port.insert("leads", buildLeadRow(companyId, createdBy, i))).id);
    deals.push((await port.insert("deals", buildDealRow(companyId, createdBy, i))).id);
    tasks.push((await port.insert("tasks", buildTaskRow(companyId, createdBy, i))).id);
  }

  return { label: spec.label, companyId, mode: spec.mode, users, recordIds: { leads, deals, tasks } };
}

/** Provision the standard two independent tenants (A and B) with distinct roles. */
export async function provisionTwoTenants(
  port: ProvisionPort,
  modeA: string,
  modeB: string,
): Promise<{ a: ProvisionedTenant; b: ProvisionedTenant }> {
  const a = await provisionTenant(port, {
    label: "Company A",
    mode: modeA,
    users: [
      { key: "owner", role: "owner", fullName: "A Owner" },
      { key: "employee", role: "employee", fullName: "A Employee" },
    ],
  });
  const b = await provisionTenant(port, {
    label: "Company B",
    mode: modeB,
    users: [
      { key: "manager", role: "manager", fullName: "B Manager" },
      { key: "employee", role: "employee", fullName: "B Employee" },
    ],
  });
  return { a, b };
}

/**
 * Deletes ONLY E2E-marked resources: companies whose name has the marker prefix,
 * all rows in child tables for those company ids, their profiles/roles, and auth
 * users on the test email domain. Returns a per-table deletion count.
 */
export async function cleanupTestData(port: ProvisionPort): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const companies = await port.selectAll("companies", "id,name");
  const testCompanyIds = companies
    .filter((c) => isTestCompanyName(c.name as string | null))
    .map((c) => c.id as string);

  // Child tables scoped by company_id (delete before the parent company).
  // user_roles has NO company_id → handled separately by user_id below.
  const childTables = [
    "ai_action_audit", "autopilot_actions", "invoices", "bulk_email_campaigns",
    "employee_profiles", "recruitment", "tasks", "deals", "leads", "customers", "profiles",
  ];
  for (const companyId of testCompanyIds) {
    // Collect this company's user_ids from profiles BEFORE deleting them, so we can
    // remove their (company-less) user_roles rows.
    const profs = await port.selectWhere("profiles", "company_id", companyId, "user_id");
    for (const p of profs) {
      counts["user_roles"] = (counts["user_roles"] ?? 0) + (await port.deleteWhere("user_roles", "user_id", p.user_id as string));
    }
    for (const table of childTables) {
      counts[table] = (counts[table] ?? 0) + (await port.deleteWhere(table, "company_id", companyId));
    }
    counts["companies"] = (counts["companies"] ?? 0) + (await port.deleteWhere("companies", "id", companyId));
  }

  // Auth users on the test domain (orphans or linked) — only marker domain.
  const authUsers = (await port.listAuthUsers()).slice(); // snapshot: deletion must not mutate what we iterate
  let deletedUsers = 0;
  for (const u of authUsers) {
    if (isTestEmail(u.email)) {
      await port.deleteAuthUser(u.id);
      deletedUsers++;
    }
  }
  counts["auth.users"] = deletedUsers;
  return counts;
}
