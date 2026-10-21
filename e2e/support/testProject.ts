/// <reference types="node" />
/**
 * Shared helpers for the authenticated E2E specs. All network goes to the
 * DEDICATED test project (guarded) — never production.
 *
 * Uses raw fetch against the Supabase Auth + REST + Functions endpoints so the
 * specs need no app-internal imports and can assert persistence directly.
 */
import { readFileSync } from "node:fs";
import { assertNonProduction } from "../../src/mastra/e2e/testenv.ts";

export interface TenantUser { key: string; userId: string; email: string; role: string }
export interface Tenant {
  label: string; companyId: string; mode: string;
  users: TenantUser[];
  recordIds: { leads: string[]; deals: string[]; tasks: string[] };
}
export interface TenantsFile { password: string; baseURL: string; tenants: { a: Tenant; b: Tenant } }

export function testConfig() {
  const url = process.env.TEST_SUPABASE_URL;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("E2E BLOCKED: TEST_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY not set (no production fallback).");
  }
  assertNonProduction(url, process.env); // refuses production / requires E2E_ALLOW_TEST_PROJECT=1
  return { url, anonKey, serviceRoleKey };
}

export function loadTenants(): TenantsFile {
  const file = process.env.E2E_TENANTS_FILE ?? "e2e/.tenants.local.json";
  try {
    return JSON.parse(readFileSync(file, "utf8")) as TenantsFile;
  } catch {
    throw new Error(`E2E BLOCKED: tenants file ${file} missing — run scripts/e2e/setup-tenants.mts first.`);
  }
}

/** Sign in a test user via GoTrue password grant; returns the access token (JWT). */
export async function signIn(email: string, password: string): Promise<string> {
  const { url, anonKey } = testConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

/** Invoke the ai-operating-manager edge function as an authenticated user. */
export async function callOperatingManager(jwt: string, body: unknown) {
  const { url, anonKey } = testConfig();
  const res = await fetch(`${url}/functions/v1/ai-operating-manager`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Service-role REST read (for asserting persistence / cross-tenant checks). */
export async function serviceSelect(table: string, query: string) {
  const { url, serviceRoleKey } = testConfig();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) throw new Error(`serviceSelect ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}
