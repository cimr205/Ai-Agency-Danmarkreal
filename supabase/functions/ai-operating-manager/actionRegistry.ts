// Pure Action Registry logic (masterprompt §5): action definitions, field
// validation, permission checks, name aliasing. No I/O, no Deno.serve side
// effects — split out of index.ts specifically so it's importable from
// index.test.ts without bootstrapping the HTTP server on import.

export type JsonObject = Record<string, unknown>;
export type Role = "system_admin" | "owner" | "company_admin" | "manager" | "employee" | "readonly" | "partner";

export interface ActionDefinition {
  name: string;
  description: string;
  requiredRoles: Role[];
  requiredFields: Record<string, "string" | "number" | "date" | "datetime" | "uuid" | "email" | "object">;
  optionalFields?: Record<string, "string" | "number" | "date" | "datetime" | "uuid" | "email" | "object">;
  risk: "low" | "medium" | "high" | "critical";
  connector: "internal" | "email.send" | "integration";
  rollback: string | null;
}

export const MEMBER_ROLES: Role[] = ["system_admin", "owner", "company_admin", "manager", "employee"];
export const MANAGER_ROLES: Role[] = ["system_admin", "owner", "company_admin", "manager"];

export const ACTIONS: Record<string, ActionDefinition> = {
  "tasks.create": {
    name: "tasks.create", description: "Opret en intern opgave", requiredRoles: MEMBER_ROLES,
    requiredFields: { title: "string" },
    optionalFields: { description: "string", priority: "string", due_date: "date", assigned_to: "uuid", lead_id: "uuid", deal_id: "uuid" },
    risk: "low", connector: "internal", rollback: "Opgaven kan slettes eller markeres annulleret.",
  },
  "crm.customer.create": {
    name: "crm.customer.create", description: "Opret en kunde", requiredRoles: MEMBER_ROLES,
    requiredFields: { name: "string", email: "email" },
    optionalFields: { phone: "string", company_name: "string" },
    risk: "medium", connector: "internal", rollback: "Kunden kan arkiveres.",
  },
  "crm.lead.create": {
    name: "crm.lead.create", description: "Opret et lead", requiredRoles: MEMBER_ROLES,
    requiredFields: { name: "string", email: "email" },
    optionalFields: { phone: "string", company_name: "string", value: "number" },
    risk: "medium", connector: "internal", rollback: "Leadet kan arkiveres.",
  },
  "crm.lead.move_stage": {
    name: "crm.lead.move_stage", description: "Flyt et lead til en ny status", requiredRoles: MEMBER_ROLES,
    requiredFields: { lead_id: "uuid", status: "string" }, risk: "medium", connector: "internal",
    rollback: "Status kan flyttes tilbage.",
  },
  "crm.deal.move_stage": {
    name: "crm.deal.move_stage", description: "Flyt en deal til en ny fase", requiredRoles: MANAGER_ROLES,
    requiredFields: { deal_id: "uuid", stage: "string" }, risk: "high", connector: "internal",
    rollback: "Fasen kan flyttes tilbage.",
  },
  "calendar.event.create": {
    name: "calendar.event.create", description: "Opret en kalenderaftale", requiredRoles: MEMBER_ROLES,
    requiredFields: { title: "string", start_time: "datetime", end_time: "datetime" },
    optionalFields: { description: "string", event_type: "string" },
    risk: "medium", connector: "internal", rollback: "Aftalen kan slettes.",
  },
  "invoice.create": {
    name: "invoice.create", description: "Opret en fakturakladde", requiredRoles: MANAGER_ROLES,
    requiredFields: { customer_id: "uuid", amount: "number" },
    optionalFields: { invoice_number: "string", due_date: "date", notes: "string" },
    risk: "high", connector: "internal", rollback: "Kladder kan slettes før afsendelse.",
  },
  "email.send": {
    name: "email.send", description: "Send en email via en forbundet konto", requiredRoles: MEMBER_ROLES,
    requiredFields: { to: "email", subject: "string", body: "string" },
    risk: "high", connector: "email.send", rollback: null,
  },
  "integration.tool.execute": {
    name: "integration.tool.execute", description: "Udfør en handling i en forbundet app", requiredRoles: MANAGER_ROLES,
    requiredFields: { integration_id: "uuid", tool_slug: "string", action_category: "string", arguments: "object" },
    risk: "high", connector: "integration", rollback: null,
  },
};

export const ACTION_ALIASES: Record<string, string> = {
  create_task: "tasks.create",
  create_followup_task: "tasks.create",
  update_lead_status: "crm.lead.move_stage",
  contact_lead: "crm.lead.move_stage",
  move_deal_stage: "crm.deal.move_stage",
  update_deal_stage: "crm.deal.move_stage",
  create_invoice: "invoice.create",
  send_email: "email.send",
  send_followup_email: "email.send",
  send_deal_followup_email: "email.send",
};

export function canonicalAction(name: string) {
  return ACTION_ALIASES[name] ?? name;
}

export function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateField(name: string, type: string, value: unknown): string | null {
  if (type === "number") return typeof value === "number" && Number.isFinite(value) ? null : `${name} skal være et tal`;
  if (type === "object") return isObject(value) ? null : `${name} skal være et objekt`;
  if (typeof value !== "string" || !value.trim()) return `${name} skal være udfyldt`;
  if (type === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return `${name} er ikke et gyldigt id`;
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${name} er ikke en gyldig email`;
  if (type === "date" && Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return `${name} er ikke en gyldig dato`;
  if (type === "datetime" && Number.isNaN(Date.parse(value))) return `${name} er ikke et gyldigt tidspunkt`;
  return null;
}

export function validateInput(definition: ActionDefinition, input: unknown): JsonObject {
  if (!isObject(input)) throw new Error("Action input skal være et objekt");
  const allowed = new Set([...Object.keys(definition.requiredFields), ...Object.keys(definition.optionalFields ?? {})]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Ukendte felter: ${unknown.join(", ")}`);
  for (const [name, type] of Object.entries(definition.requiredFields)) {
    const issue = validateField(name, type, input[name]);
    if (issue) throw new Error(issue);
  }
  for (const [name, type] of Object.entries(definition.optionalFields ?? {})) {
    if (input[name] !== undefined && input[name] !== null && input[name] !== "") {
      const issue = validateField(name, type, input[name]);
      if (issue) throw new Error(issue);
    }
  }
  return input;
}

export function canExecute(definition: ActionDefinition, roles: Role[]) {
  return roles.some((role) => definition.requiredRoles.includes(role));
}
