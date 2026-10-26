/// <reference types="node" />
/**
 * Test-environment configuration, production guards, resource markers and
 * record factories for the Mastra two-tenant E2E (QA-1).
 *
 * SAFETY: every entry point refuses to run unless a DEDICATED non-production
 * Supabase test project is configured via `TEST_SUPABASE_*` env vars AND the
 * operator has explicitly acknowledged it is a test project. It never falls
 * back to production credentials or URLs.
 */

export class ProductionGuardError extends Error {}

export interface TestSupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Postgres connection string for applying migrations (optional). */
  dbUrl?: string;
}

type Env = Record<string, string | undefined>;

function isTruthy(v: string | undefined): boolean {
  return v !== undefined && ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Refuses unless `url` is clearly a dedicated, non-production test project.
 * Throws ProductionGuardError otherwise. Checks:
 *  - must not equal the production URL (`VITE_SUPABASE_URL` / `PROD_SUPABASE_URL`);
 *  - must not match a known production project id (`VITE_SUPABASE_PROJECT_ID` / `PROD_SUPABASE_PROJECT_ID`);
 *  - operator must set `E2E_ALLOW_TEST_PROJECT=1` to confirm intent.
 */
export function assertNonProduction(url: string, env: Env = process.env): void {
  const prodUrls = [env.VITE_SUPABASE_URL, env.PROD_SUPABASE_URL].filter(Boolean) as string[];
  for (const p of prodUrls) {
    if (normalizeUrl(url) === normalizeUrl(p)) {
      throw new ProductionGuardError(
        "TEST_SUPABASE_URL equals a production Supabase URL — refusing. Use a dedicated test project.",
      );
    }
  }
  const prodRefs = [env.VITE_SUPABASE_PROJECT_ID, env.PROD_SUPABASE_PROJECT_ID].filter(Boolean) as string[];
  for (const ref of prodRefs) {
    if (ref && normalizeUrl(url).includes(ref.toLowerCase())) {
      throw new ProductionGuardError(
        `TEST_SUPABASE_URL contains the production project id "${ref}" — refusing.`,
      );
    }
  }
  if (!isTruthy(env.E2E_ALLOW_TEST_PROJECT)) {
    throw new ProductionGuardError(
      "Refusing to run: set E2E_ALLOW_TEST_PROJECT=1 to confirm TEST_SUPABASE_URL is a dedicated NON-production project.",
    );
  }
}

/** Loads & validates the test env. Throws ProductionGuardError when missing or unsafe. */
export function loadTestEnv(env: Env = process.env): TestSupabaseEnv {
  const url = env.TEST_SUPABASE_URL;
  const anonKey = env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url && "TEST_SUPABASE_URL",
    !anonKey && "TEST_SUPABASE_ANON_KEY",
    !serviceRoleKey && "TEST_SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new ProductionGuardError(
      `Missing required test config: ${missing.join(", ")}. No production fallback — aborting.`,
    );
  }
  assertNonProduction(url!, env);
  return { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey!, dbUrl: env.TEST_SUPABASE_DB_URL };
}

// ───────────────────────── Resource markers ─────────────────────────
// Every E2E-created resource is tagged so cleanup can delete ONLY test data.

export const E2E_MARKER = "e2e-qa";
export const E2E_EMAIL_DOMAIN = "e2e.aiagencydk.test"; // RFC 6761 .test — never deliverable

export function testEmail(local: string): string {
  return `${E2E_MARKER}+${local}-${Date.now()}@${E2E_EMAIL_DOMAIN}`;
}
export function isTestEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith(`@${E2E_EMAIL_DOMAIN}`));
}
export function testCompanyName(label: string): string {
  return `[${E2E_MARKER}] ${label}`;
}
export function isTestCompanyName(name: string | null | undefined): boolean {
  return Boolean(name && name.startsWith(`[${E2E_MARKER}] `));
}

// ───────────────────────── Record factories ─────────────────────────
// Pure builders — deterministic shape, tagged to a company. No randomness
// beyond an explicit seed so tests are reproducible.

export type AppRole = "owner" | "manager" | "employee";

export interface TenantSpec {
  label: string;
  /** company automation mode set via set_company_mode (e.g. OFF/DRAFT_APPROVAL/AUTO per app). */
  mode: string;
  users: Array<{ key: string; role: AppRole; fullName: string }>;
}

export function buildCompanyRow(label: string, mode: string) {
  return { name: testCompanyName(label), mode, status: "active", onboarding_completed: true };
}

// NOTE: schema facts verified against the live test DB (committed types.ts was
// stale in places): user_roles DOES have company_id (confirmed by later
// production-schema forensics, migration 20261023000001_user_roles_company_id —
// it mirrors production; a prior pass here incorrectly believed it didn't exist).
// handle_new_user() only inserts into `profiles` now (no longer seeds a default
// user_roles row), so provisioning must INSERT user_roles, not UPDATE.
// leads has NO record_type; deals/tasks require created_by.

/** UPDATE payload for the trigger-created profile row (matched by user_id). */
export function buildProfileUpdate(companyId: string, fullName: string) {
  return { company_id: companyId, full_name: fullName, onboarding_completed: true };
}

/** INSERT row for a user's role in a company (no default row is trigger-created). */
export function buildUserRoleRow(userId: string, companyId: string, role: AppRole) {
  return { user_id: userId, company_id: companyId, role, can_grant_permissions: role === "owner" };
}

export function buildLeadRow(companyId: string, createdBy: string, i: number) {
  return { company_id: companyId, name: `${E2E_MARKER} Lead ${i}`, email: `${E2E_MARKER}-lead${i}@${E2E_EMAIL_DOMAIN}`, status: "new", score: 10 * i, created_by: createdBy };
}
export function buildDealRow(companyId: string, createdBy: string, i: number) {
  return { company_id: companyId, title: `${E2E_MARKER} Deal ${i}`, value: 1000 * i, created_by: createdBy };
}
export function buildTaskRow(companyId: string, createdBy: string, i: number) {
  return { company_id: companyId, title: `${E2E_MARKER} Task ${i}`, created_by: createdBy };
}
