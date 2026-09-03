// deno-lint-ignore-file no-explicit-any
import type { Role } from "../execution/execution.types.ts";

// Company-scoped: user_roles now carries company_id (a user can hold
// different roles in different companies over their lifetime). Filtering
// here is what actually enforces that in the app layer — without it, a
// user with a leftover role from a previous company would get it back
// here regardless of which company they're currently acting in.
export async function loadRoles(db: any, userId: string, companyId: string): Promise<Role[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("company_id", companyId);
  return (data ?? []).map((row: { role: Role }) => row.role);
}
