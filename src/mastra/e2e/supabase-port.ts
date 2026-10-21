/// <reference types="node" />
/**
 * supabase-js adapter for {@link ProvisionPort}. Built ONLY after
 * {@link loadTestEnv} passes the production guard, using the TEST project's
 * service-role key. Never imported by unit tests (which use a fake port).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProvisionPort } from "./provision.ts";
import { loadTestEnv } from "./testenv.ts";

/** Creates a service-role client against the dedicated TEST project (guarded). */
export function createServiceClient(): SupabaseClient {
  const env = loadTestEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates an anon client against the TEST project (for authenticating as a test user). */
export function createAnonClient(): SupabaseClient {
  const env = loadTestEnv();
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabasePort(client: SupabaseClient): ProvisionPort {
  return {
    async createConfirmedUser(email, password, fullName) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
      return { id: data.user.id };
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select("id").single();
      if (error) throw new Error(`insert ${table} failed: ${error.message}`);
      return { id: (data as { id: string }).id };
    },
    async update(table, matchColumn, matchValue, row) {
      const { error } = await client.from(table).update(row).eq(matchColumn, matchValue);
      if (error) throw new Error(`update ${table} failed: ${error.message}`);
    },
    async rpc(fn, args) {
      const { error } = await client.rpc(fn, args);
      if (error) throw new Error(`rpc ${fn} failed: ${error.message}`);
    },
    async selectWhere(table, column, value, cols = "id") {
      const { data, error } = await client.from(table).select(cols).eq(column, value);
      if (error) throw new Error(`select ${table} failed: ${error.message}`);
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
    async selectAll(table, cols = "id") {
      const { data, error } = await client.from(table).select(cols);
      if (error) throw new Error(`selectAll ${table} failed: ${error.message}`);
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
    async deleteWhere(table, column, value) {
      const { data, error } = await client.from(table).delete().eq(column, value).select("id");
      if (error) throw new Error(`delete ${table} failed: ${error.message}`);
      return (data ?? []).length;
    },
    async listAuthUsers() {
      const { data, error } = await client.auth.admin.listUsers();
      if (error) throw new Error(`listUsers failed: ${error.message}`);
      return data.users.map((u) => ({ id: u.id, email: u.email ?? undefined }));
    },
    async deleteAuthUser(id) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser failed: ${error.message}`);
    },
  };
}
