import type { Capability } from "./capability.types.ts";
import type { Domain } from "../router/request-router.ts";
import type { Role } from "../execution/execution.types.ts";

// Server-instance singleton. The user can never send a registry id and
// bypass permission checks — capability ids only ever come from this
// registry's own search/get, never round-tripped from client input as
// something authoritative.
class CapabilityRegistryImpl {
  private byId = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.byId.has(capability.id)) throw new Error(`Capability already registered: ${capability.id}`);
    this.byId.set(capability.id, capability);
  }

  get(id: string): Capability | undefined {
    return this.byId.get(id);
  }

  search(query: string): Capability[] {
    const q = query.toLowerCase();
    return [...this.byId.values()].filter(
      (c) => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }

  getByDomain(domain: Domain): Capability[] {
    return [...this.byId.values()].filter((c) => c.domain === domain);
  }

  /** Capabilities the given roles are actually permitted to use. */
  getAvailableForWorkspace(roles: Role[]): Capability[] {
    return [...this.byId.values()].filter((c) => roles.some((r) => c.requiredPermissions.includes(r)));
  }

  all(): Capability[] {
    return [...this.byId.values()];
  }
}

export const CapabilityRegistry = new CapabilityRegistryImpl();
