/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
export type Role = "system_admin" | "owner" | "company_admin" | "manager" | "employee" | "readonly" | "partner";

export interface ExecutionContext {
  db: any; // Supabase client, service-role — capabilities must always filter by workspaceId themselves
  workspaceId: string; // = company_id, resolved server-side from the auth token, never from the request body
  userId: string;
  roles: Role[];
  authHeader: string; // for capabilities that call other edge functions (gmail-send, composio-integration)
}

export interface CapabilityResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
