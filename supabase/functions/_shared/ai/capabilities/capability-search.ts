import { CapabilityRegistry } from "./capability-registry.ts";
import type { Capability } from "./capability.types.ts";
import type { Domain } from "../router/request-router.ts";
import type { Role } from "../execution/execution.types.ts";

// We'll have hundreds of integrations eventually — never send the whole
// registry to the model. Domain routing already narrows the field; this
// adds a light keyword score on top so e.g. "send" ranks email.send above
// email.search within the email domain, and always includes crm.contacts
// alongside anything that plausibly needs to resolve a person by name
// ("send Peter an email" needs both email.send and crm.contacts.search).
export function searchCapabilities(message: string, domain: Domain, roles: Role[], limit = 6): Capability[] {
  const domainCapabilities = CapabilityRegistry.getByDomain(domain).filter((c) => roles.some((r) => c.requiredPermissions.includes(r)));
  const lower = message.toLowerCase();

  const scored = domainCapabilities.map((c) => {
    let score = 0;
    if (/read|search|find|vis|søg|zeig/i.test(lower) && c.risk === "read") score += 2;
    if (/send|opret|create|erstelle|book|opdatér|update/i.test(lower) && c.risk !== "read") score += 2;
    if (lower.includes(c.name.toLowerCase())) score += 3;
    return { c, score };
  }).sort((a, b) => b.score - a.score).map((s) => s.c);

  const needsPersonLookup = /\b(ham|hende|peter|kontakt|contact|kunde|customer|kontakten)\b/i.test(lower) && domain !== "crm";
  const extra = needsPersonLookup ? CapabilityRegistry.getByDomain("crm").filter((c) => c.id === "crm.contacts.search") : [];

  return [...extra, ...scored].slice(0, limit);
}
