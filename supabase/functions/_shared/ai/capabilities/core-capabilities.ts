import { z } from "npm:zod@3.23.8";
import type { Capability } from "./capability.types.ts";
import type { CapabilityResult } from "../execution/execution.types.ts";
import { CapabilityRegistry } from "./capability-registry.ts";

const MEMBER: import("../execution/execution.types.ts").Role[] = ["system_admin", "owner", "company_admin", "manager", "employee"];
const MANAGER: import("../execution/execution.types.ts").Role[] = ["system_admin", "owner", "company_admin", "manager"];

function ok(data: unknown): CapabilityResult { return { success: true, data }; }
function fail(error: string): CapabilityResult { return { success: false, error }; }

// ─── CRM: leads & customers (record_type discriminates the two) ──────────
const leadsSearch: Capability = {
  id: "crm.leads.search", domain: "crm", name: "Søg leads", description: "Søg efter leads i CRM'et",
  inputSchema: z.object({ query: z.string().optional(), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { query, limit } = input as { query?: string; limit: number };
    let q = ctx.db.from("customers").select("id,name,email,phone,status,score,value").eq("company_id", ctx.workspaceId).eq("record_type", "lead").limit(limit);
    if (query) q = q.ilike("name", `%${query}%`);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
};

const leadsGet: Capability = {
  id: "crm.leads.get", domain: "crm", name: "Hent lead", description: "Hent ét lead ved id",
  inputSchema: z.object({ id: z.string().uuid() }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id } = input as { id: string };
    const { data, error } = await ctx.db.from("customers").select("*").eq("id", id).eq("company_id", ctx.workspaceId).eq("record_type", "lead").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Lead not found");
    return ok(data);
  },
};

const leadsCreate: Capability = {
  id: "crm.leads.create", domain: "crm", name: "Opret lead", description: "Opret et nyt lead",
  inputSchema: z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional(), company_name: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.from("customers").insert({ ...(input as object), company_id: ctx.workspaceId, created_by: ctx.userId, record_type: "lead", status: "new" }).select("id,name,email").single();
    return error ? fail(error.message) : ok(data);
  },
};

const leadsUpdate: Capability = {
  id: "crm.leads.update", domain: "crm", name: "Opdatér lead", description: "Opdatér status eller felter på et lead",
  inputSchema: z.object({ id: z.string().uuid(), status: z.string().optional(), notes: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id, ...updates } = input as { id: string; [k: string]: unknown };
    const { data, error } = await ctx.db.from("customers").update({ ...updates, last_touched_at: new Date().toISOString() }).eq("id", id).eq("company_id", ctx.workspaceId).eq("record_type", "lead").select("id,name,status").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Lead not found");
    return ok(data);
  },
};

// ─── CRM: contacts — no dedicated contacts table exists yet (confirmed
// gap); contact info lives directly on customers/leads. Mapped there
// rather than left unimplemented, matching real schema. ────────────────
const contactsSearch: Capability = {
  id: "crm.contacts.search", domain: "crm", name: "Søg kontakter", description: "Søg efter kontaktpersoner (kunder/leads) ved navn eller email",
  inputSchema: z.object({ query: z.string().min(1), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { query, limit } = input as { query: string; limit: number };
    const { data, error } = await ctx.db.from("customers").select("id,name,email,phone,record_type")
      .eq("company_id", ctx.workspaceId).or(`name.ilike.%${query}%,email.ilike.%${query}%`).limit(limit);
    return error ? fail(error.message) : ok(data);
  },
};

const contactsGet: Capability = {
  id: "crm.contacts.get", domain: "crm", name: "Hent kontakt", description: "Hent én kontakt ved id",
  inputSchema: z.object({ id: z.string().uuid() }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id } = input as { id: string };
    const { data, error } = await ctx.db.from("customers").select("*").eq("id", id).eq("company_id", ctx.workspaceId).maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Contact not found");
    return ok(data);
  },
};

const contactsCreate: Capability = {
  id: "crm.contacts.create", domain: "crm", name: "Opret kontakt", description: "Opret en ny kontakt/kunde",
  inputSchema: z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.from("customers").insert({ ...(input as object), company_id: ctx.workspaceId, created_by: ctx.userId, record_type: "customer" }).select("id,name,email").single();
    return error ? fail(error.message) : ok(data);
  },
};

const contactsUpdate: Capability = {
  id: "crm.contacts.update", domain: "crm", name: "Opdatér kontakt", description: "Opdatér en kontakts oplysninger",
  inputSchema: z.object({ id: z.string().uuid(), name: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id, ...updates } = input as { id: string; [k: string]: unknown };
    const { data, error } = await ctx.db.from("customers").update(updates).eq("id", id).eq("company_id", ctx.workspaceId).select("id,name,email").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Contact not found");
    return ok(data);
  },
};

// ─── CRM: deals ────────────────────────────────────────────────────────
const dealsSearch: Capability = {
  id: "crm.deals.search", domain: "crm", name: "Søg deals", description: "Søg efter deals i pipeline",
  inputSchema: z.object({ query: z.string().optional(), stage: z.string().optional(), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { query, stage, limit } = input as { query?: string; stage?: string; limit: number };
    let q = ctx.db.from("deals").select("id,title,stage,value,customer_id").eq("company_id", ctx.workspaceId).limit(limit);
    if (query) q = q.ilike("title", `%${query}%`);
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
};

const dealsCreate: Capability = {
  id: "crm.deals.create", domain: "crm", name: "Opret deal", description: "Opret en ny deal",
  inputSchema: z.object({ title: z.string().min(1), value: z.number().default(0), customer_id: z.string().uuid().optional(), stage: z.string().default("discovery") }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.from("deals").insert({ ...(input as object), company_id: ctx.workspaceId, created_by: ctx.userId }).select("id,title,stage,value").single();
    return error ? fail(error.message) : ok(data);
  },
};

const dealsUpdate: Capability = {
  id: "crm.deals.update", domain: "crm", name: "Opdatér deal", description: "Flyt fase eller opdatér felter på en deal",
  inputSchema: z.object({ id: z.string().uuid(), stage: z.string().optional(), value: z.number().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MANAGER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id, ...updates } = input as { id: string; [k: string]: unknown };
    const { data, error } = await ctx.db.from("deals").update(updates).eq("id", id).eq("company_id", ctx.workspaceId).select("id,title,stage").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Deal not found");
    return ok(data);
  },
};

// ─── Tasks ─────────────────────────────────────────────────────────────
const tasksSearch: Capability = {
  id: "tasks.search", domain: "tasks", name: "Søg opgaver", description: "Søg efter opgaver",
  inputSchema: z.object({ query: z.string().optional(), status: z.string().optional(), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { query, status, limit } = input as { query?: string; status?: string; limit: number };
    let q = ctx.db.from("tasks").select("id,title,status,priority,due_date").eq("company_id", ctx.workspaceId).eq("archived", false).limit(limit);
    if (query) q = q.ilike("title", `%${query}%`);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
};

const tasksCreate: Capability = {
  id: "tasks.create", domain: "tasks", name: "Opret opgave", description: "Opret en ny opgave",
  inputSchema: z.object({ title: z.string().min(1), description: z.string().optional(), due_date: z.string().optional(), priority: z.string().default("medium"), lead_id: z.string().uuid().optional(), deal_id: z.string().uuid().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.from("tasks").insert({ ...(input as object), company_id: ctx.workspaceId, created_by: ctx.userId, status: "pending" }).select("id,title,due_date").single();
    return error ? fail(error.message) : ok(data);
  },
};

const tasksUpdate: Capability = {
  id: "tasks.update", domain: "tasks", name: "Opdatér opgave", description: "Opdatér felter på en opgave",
  inputSchema: z.object({ id: z.string().uuid(), title: z.string().optional(), due_date: z.string().optional(), priority: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id, ...updates } = input as { id: string; [k: string]: unknown };
    const { data, error } = await ctx.db.from("tasks").update(updates).eq("id", id).eq("company_id", ctx.workspaceId).select("id,title,status").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Task not found");
    return ok(data);
  },
};

const tasksComplete: Capability = {
  id: "tasks.complete", domain: "tasks", name: "Fuldfør opgave", description: "Markér en opgave som fuldført",
  inputSchema: z.object({ id: z.string().uuid() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id } = input as { id: string };
    const { data, error } = await ctx.db.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).eq("company_id", ctx.workspaceId).select("id,title").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Task not found");
    return ok(data);
  },
};

// ─── Email — real send (native Gmail OAuth or company Composio Gmail via
// gmail-send's fallback, fixed earlier this session), real search/read
// against the emails table. ────────────────────────────────────────────
const emailSend: Capability = {
  id: "email.send", domain: "email", name: "Send email", description: "Send en email til en modtager",
  inputSchema: z.object({ to: z.string().email(), subject: z.string().min(1), body: z.string().min(1), cc: z.string().email().optional() }),
  risk: "external_write", requiresConfirmation: true, requiredPermissions: MEMBER, supportedProviders: ["native", "composio"],
  async execute(ctx, input) {
    const { to, subject, body, cc } = input as { to: string; subject: string; body: string; cc?: string };
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: ctx.authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
      body: JSON.stringify({ to, subject, message: body, cc }),
    });
    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) return fail(resBody.error ?? "Email could not be sent");
    return ok({ to, subject, via: resBody.via ?? "native" });
  },
};

const emailSearch: Capability = {
  id: "email.search", domain: "email", name: "Søg emails", description: "Søg i modtagne emails",
  inputSchema: z.object({ query: z.string().optional(), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { query, limit } = input as { query?: string; limit: number };
    let q = ctx.db.from("emails").select("id,subject,from_address,from_name,received_at").eq("company_id", ctx.workspaceId).order("received_at", { ascending: false }).limit(limit);
    if (query) q = q.ilike("subject", `%${query}%`);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
};

const emailRead: Capability = {
  id: "email.read", domain: "email", name: "Læs email", description: "Hent indholdet af én email ved id",
  inputSchema: z.object({ id: z.string().uuid() }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id } = input as { id: string };
    const { data, error } = await ctx.db.from("emails").select("*").eq("id", id).eq("company_id", ctx.workspaceId).maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Email not found");
    return ok(data);
  },
};

// ─── Calendar ──────────────────────────────────────────────────────────
const calendarSearch: Capability = {
  id: "calendar.search_events", domain: "calendar", name: "Søg kalenderbegivenheder", description: "Find møder/aftaler i et tidsrum",
  inputSchema: z.object({ from: z.string().optional(), to: z.string().optional(), limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { from, to, limit } = input as { from?: string; to?: string; limit: number };
    let q = ctx.db.from("calendar_events").select("id,title,start_time,end_time").eq("company_id", ctx.workspaceId).order("start_time", { ascending: true }).limit(limit);
    if (from) q = q.gte("start_time", from);
    if (to) q = q.lte("start_time", to);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
};

const calendarCreate: Capability = {
  id: "calendar.create_event", domain: "calendar", name: "Opret kalenderbegivenhed", description: "Book et møde/en aftale",
  inputSchema: z.object({ title: z.string().min(1), start_time: z.string(), end_time: z.string(), description: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { start_time, end_time } = input as { start_time: string; end_time: string };
    if (Date.parse(end_time) <= Date.parse(start_time)) return fail("Sluttid skal være efter starttid");
    const { data, error } = await ctx.db.from("calendar_events").insert({ ...(input as object), company_id: ctx.workspaceId, created_by: ctx.userId }).select("id,title,start_time,end_time").single();
    return error ? fail(error.message) : ok(data);
  },
};

const calendarUpdate: Capability = {
  id: "calendar.update_event", domain: "calendar", name: "Opdatér kalenderbegivenhed", description: "Flyt tidspunkt eller titel på en aftale",
  inputSchema: z.object({ id: z.string().uuid(), title: z.string().optional(), start_time: z.string().optional(), end_time: z.string().optional() }),
  risk: "write", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id, ...updates } = input as { id: string; [k: string]: unknown };
    const { data, error } = await ctx.db.from("calendar_events").update(updates).eq("id", id).eq("company_id", ctx.workspaceId).select("id,title,start_time").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Event not found");
    return ok(data);
  },
};

const calendarCancel: Capability = {
  id: "calendar.cancel_event", domain: "calendar", name: "Aflys kalenderbegivenhed", description: "Slet en aftale",
  inputSchema: z.object({ id: z.string().uuid() }),
  risk: "destructive", requiresConfirmation: true, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { id } = input as { id: string };
    const { error } = await ctx.db.from("calendar_events").delete().eq("id", id).eq("company_id", ctx.workspaceId);
    return error ? fail(error.message) : ok({ id, cancelled: true });
  },
};

// ─── Files — Documents module is Notion-via-Composio (LIVE_MODULES); no
// native file table exists to search/read directly. Real, not a stub:
// calls the same composio-integration list-documents action the
// Documents page itself uses. ──────────────────────────────────────────
const filesSearch: Capability = {
  id: "files.search", domain: "files", name: "Søg dokumenter", description: "Søg i forbundne dokumenter (Notion)",
  inputSchema: z.object({ query: z.string().optional() }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["composio"],
  async execute(ctx, input) {
    const { query } = input as { query?: string };
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/composio-integration`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: ctx.authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
      body: JSON.stringify({ action: "list-documents", query: query ?? "" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return fail(body.error ?? "Ingen dokumentkilde forbundet endnu");
    return ok(body);
  },
};

const filesRead: Capability = {
  id: "files.read", domain: "files", name: "Læs dokument", description: "Hent indholdet af ét dokument",
  inputSchema: z.object({ id: z.string() }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["composio"],
  execute(_ctx, input) {
    // Composio's list-documents returns full content today; a dedicated
    // single-document fetch isn't wired yet — real gap, not simulated.
    return Promise.resolve(fail(`Direkte dokument-opslag (${(input as { id: string }).id}) er endnu ikke understøttet — brug files.search.`));
  },
};

// ─── Marketing — real table is email_campaigns (durable bulk email),
// NOT the useCampaigns() frontend hook (confirmed to be a hardcoded fake
// stub returning [] — a separate, pre-existing frontend bug, out of
// scope here but worth flagging). ──────────────────────────────────────
const campaignsRead: Capability = {
  id: "marketing.campaigns.read", domain: "marketing", name: "Vis kampagner", description: "Vis email-kampagner",
  inputSchema: z.object({ limit: z.number().max(50).default(10) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { limit } = input as { limit: number };
    const { data, error } = await ctx.db.from("bulk_email_campaigns").select("id,subject,status,created_at").eq("company_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(limit);
    return error ? fail(error.message) : ok(data);
  },
};

const campaignsCreate: Capability = {
  id: "marketing.campaigns.create", domain: "marketing", name: "Opret kampagne-kladde", description: "Opret en kladde til en email-kampagne (skal sendes fra Bulk Email-siden)",
  inputSchema: z.object({ subject: z.string().min(1), html_body: z.string().min(1) }),
  risk: "write", requiresConfirmation: true, requiredPermissions: MANAGER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.from("bulk_email_campaigns").insert({ ...(input as object), company_id: ctx.workspaceId, user_id: ctx.userId, status: "draft" }).select("id,subject,status").single();
    return error ? fail(error.message) : ok(data);
  },
};

// ─── Integrations ──────────────────────────────────────────────────────
const integrationsSearch: Capability = {
  id: "integrations.search", domain: "integrations", name: "Søg integrationer", description: "Vis forbundne integrationer",
  inputSchema: z.object({}),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx) {
    const { data, error } = await ctx.db.from("integrations").select("id,provider,status,account_label").eq("company_id", ctx.workspaceId);
    return error ? fail(error.message) : ok(data);
  },
};

const integrationsStatus: Capability = {
  id: "integrations.connection_status", domain: "integrations", name: "Forbindelsesstatus", description: "Tjek om en given udbyder er forbundet",
  inputSchema: z.object({ provider: z.string().min(1) }),
  risk: "read", requiresConfirmation: false, requiredPermissions: MEMBER, supportedProviders: ["native"],
  async execute(ctx, input) {
    const { provider } = input as { provider: string };
    const { data, error } = await ctx.db.from("integrations").select("status,account_label").eq("company_id", ctx.workspaceId).eq("provider", provider).maybeSingle();
    if (error) return fail(error.message);
    return ok(data ?? { status: "not_connected" });
  },
};

export const CORE_CAPABILITIES: Capability[] = [
  leadsSearch, leadsGet, leadsCreate, leadsUpdate,
  contactsSearch, contactsGet, contactsCreate, contactsUpdate,
  dealsSearch, dealsCreate, dealsUpdate,
  tasksSearch, tasksCreate, tasksUpdate, tasksComplete,
  emailSend, emailSearch, emailRead,
  calendarSearch, calendarCreate, calendarUpdate, calendarCancel,
  filesSearch, filesRead,
  campaignsRead, campaignsCreate,
  integrationsSearch, integrationsStatus,
];

export function registerCoreCapabilities(): void {
  for (const capability of CORE_CAPABILITIES) {
    if (!CapabilityRegistry.get(capability.id)) CapabilityRegistry.register(capability);
  }
}
