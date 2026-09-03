// deno-lint-ignore-file no-explicit-any
import type { Role } from "../execution/execution.types.ts";

export async function loadRoles(db: any, userId: string): Promise<Role[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row: { role: Role }) => row.role);
}
