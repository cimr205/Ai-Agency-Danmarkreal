import type { Capability } from "../capabilities/capability.types.ts";
import type { Role } from "../execution/execution.types.ts";

export const PermissionEngine = {
  /** AI permissions must never exceed the acting user's own permissions. */
  canUse(capability: Capability, roles: Role[]): boolean {
    return roles.some((r) => capability.requiredPermissions.includes(r));
  },
};
