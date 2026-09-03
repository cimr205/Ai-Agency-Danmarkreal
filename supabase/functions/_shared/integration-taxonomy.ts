// Single canonical capability taxonomy for the Integration Intelligence
// layer (DNA engine, Opportunity engine, module-availability gating,
// impact map). This is the PRODUCT-level capability vocabulary — coarser
// than the AI engine's execution-level capabilities in
// _shared/ai/capabilities/core-capabilities.ts (e.g. "email.send" here vs
// the AI engine's granular crm.leads.search/get/create/update) — because
// this layer answers "what parts of the product light up", not "what can
// the AI planner call". Both layers intentionally use the same leaf ids
// where they overlap (email.send, calendar.*) so the two systems agree on
// what a capability means, without forcing one taxonomy to serve both jobs.
//
// This file used to be duplicated as TOOLKIT_CAPABILITIES/MODULE_REQUIREMENTS
// inline in composio-integration/index.ts — consolidated here so the DNA
// engine, the opportunity engine, and module-availability gating can never
// drift out of sync with each other.

export type CapabilityId =
  | "email.send" | "email.read"
  | "calendar.read" | "calendar.write"
  | "crm.contacts.read" | "crm.contacts.write"
  | "crm.deals.read" | "crm.deals.write"
  | "commerce.products.read" | "commerce.products.write" | "commerce.orders.read"
  | "ads.read" | "ads.manage" | "ads.leads.read"
  | "payments.read" | "payments.events"
  | "files.read" | "files.write"
  | "messaging.send"
  | "analytics.read";

export interface CapabilityDescriptor {
  id: CapabilityId;
  name: string;
  category: "communication" | "scheduling" | "crm" | "commerce" | "finance" | "files" | "marketing" | "analytics";
  description: string;
  compatibleModules: string[];
  valueTags: string[];
}

export const CAPABILITY_TAXONOMY: Record<CapabilityId, CapabilityDescriptor> = {
  "email.send": {
    id: "email.send", name: "Send email", category: "communication",
    description: "Send emails on the company's behalf from leads, customers, deals, invoices, and bulk campaigns.",
    compatibleModules: ["leads", "customers", "deals", "bulk-email", "invoices", "quotes", "ai"],
    valueTags: ["sales", "follow-up", "communication", "automation"],
  },
  "email.read": {
    id: "email.read", name: "Read email", category: "communication",
    description: "Read and sync incoming email into Smart Inbox and customer/lead/deal timelines.",
    compatibleModules: ["smart-inbox", "leads", "customers", "deals", "ai"],
    valueTags: ["communication", "context", "automation"],
  },
  "calendar.read": {
    id: "calendar.read", name: "Read calendar", category: "scheduling",
    description: "See upcoming meetings on leads, customers, and deals.",
    compatibleModules: ["leads", "customers", "deals", "tasks", "ai"],
    valueTags: ["scheduling", "context"],
  },
  "calendar.write": {
    id: "calendar.write", name: "Book meetings", category: "scheduling",
    description: "Book and update meetings directly from leads, customers, and deals.",
    compatibleModules: ["leads", "customers", "deals", "tasks", "ai"],
    valueTags: ["scheduling", "automation", "follow-up"],
  },
  "crm.contacts.read": {
    id: "crm.contacts.read", name: "Read external CRM contacts", category: "crm",
    description: "Read contacts from a connected external CRM for attribution/dedupe.",
    compatibleModules: ["leads", "customers"],
    valueTags: ["crm", "data-sync"],
  },
  "crm.contacts.write": {
    id: "crm.contacts.write", name: "Write external CRM contacts", category: "crm",
    description: "Push contacts into a connected external CRM.",
    compatibleModules: ["leads", "customers"],
    valueTags: ["crm", "data-sync"],
  },
  "crm.deals.read": {
    id: "crm.deals.read", name: "Read external CRM deals", category: "crm",
    description: "Read deal data from a connected external CRM.",
    compatibleModules: ["deals"],
    valueTags: ["crm", "data-sync"],
  },
  "crm.deals.write": {
    id: "crm.deals.write", name: "Write external CRM deals", category: "crm",
    description: "Push deal data into a connected external CRM.",
    compatibleModules: ["deals"],
    valueTags: ["crm", "data-sync"],
  },
  "commerce.products.read": {
    id: "commerce.products.read", name: "Read products", category: "commerce",
    description: "Read product catalog from a connected store.",
    compatibleModules: ["marketing"],
    valueTags: ["commerce"],
  },
  "commerce.products.write": {
    id: "commerce.products.write", name: "Write products", category: "commerce",
    description: "Update product catalog on a connected store.",
    compatibleModules: ["marketing"],
    valueTags: ["commerce"],
  },
  "commerce.orders.read": {
    id: "commerce.orders.read", name: "Read orders", category: "commerce",
    description: "Read order data from a connected store.",
    compatibleModules: ["marketing", "finance"],
    valueTags: ["commerce", "revenue"],
  },
  "ads.read": {
    id: "ads.read", name: "Read ad performance", category: "marketing",
    description: "Read ad campaign performance and spend.",
    compatibleModules: ["marketing", "reporting"],
    valueTags: ["marketing", "attribution"],
  },
  "ads.manage": {
    id: "ads.manage", name: "Manage ad campaigns", category: "marketing",
    description: "Create and adjust ad campaigns.",
    compatibleModules: ["marketing"],
    valueTags: ["marketing", "automation"],
  },
  "ads.leads.read": {
    id: "ads.leads.read", name: "Import ad leads", category: "marketing",
    description: "Pull leads generated by ad campaigns directly into CRM.",
    compatibleModules: ["marketing", "leads"],
    valueTags: ["marketing", "sales", "automation"],
  },
  "payments.read": {
    id: "payments.read", name: "Read payments", category: "finance",
    description: "See payment status against invoices and customers.",
    compatibleModules: ["invoices", "finance", "customers"],
    valueTags: ["finance", "reconciliation"],
  },
  "payments.events": {
    id: "payments.events", name: "Payment webhooks", category: "finance",
    description: "React automatically when a payment is completed.",
    compatibleModules: ["invoices", "finance", "customers"],
    valueTags: ["finance", "automation", "reconciliation"],
  },
  "files.read": {
    id: "files.read", name: "Search files", category: "files",
    description: "Search and attach files/documents from a connected drive.",
    compatibleModules: ["leads", "customers", "deals", "invoices", "quotes"],
    valueTags: ["files", "context"],
  },
  "files.write": {
    id: "files.write", name: "Store files", category: "files",
    description: "Save documents (proposals, contracts) to a connected drive.",
    compatibleModules: ["leads", "customers", "deals", "invoices", "quotes"],
    valueTags: ["files", "automation"],
  },
  "messaging.send": {
    id: "messaging.send", name: "Send notifications", category: "marketing",
    description: "Route approvals, alerts, and updates to a team messaging channel.",
    compatibleModules: ["tasks", "notifications", "ai"],
    valueTags: ["notifications", "automation"],
  },
  "analytics.read": {
    id: "analytics.read", name: "Read analytics", category: "marketing",
    description: "Pull product/marketing analytics into reporting.",
    compatibleModules: ["reporting", "marketing"],
    valueTags: ["analytics", "attribution"],
  },
};

export const PROVIDER_CAPABILITIES: Record<string, CapabilityId[]> = {
  gmail: ["email.send", "email.read"],
  outlook: ["email.send", "email.read", "calendar.read", "calendar.write"],
  googlecalendar: ["calendar.read", "calendar.write"],
  calendly: ["calendar.read"],
  slack: ["messaging.send"],
  hubspot: ["crm.contacts.read", "crm.contacts.write", "crm.deals.read", "crm.deals.write"],
  pipedrive: ["crm.contacts.read", "crm.contacts.write", "crm.deals.read", "crm.deals.write"],
  salesforce: ["crm.contacts.read", "crm.contacts.write", "crm.deals.read", "crm.deals.write"],
  shopify: ["commerce.products.read", "commerce.products.write", "commerce.orders.read"],
  metaads: ["ads.read", "ads.manage", "ads.leads.read"],
  stripe: ["payments.read", "payments.events"],
  googledrive: ["files.read", "files.write"],
  notion: ["files.read", "files.write"],
  github: ["files.read"],
  klaviyo: ["messaging.send", "analytics.read"],
  mailchimp: ["email.send", "analytics.read"],
  posthog: ["analytics.read"],
  mixpanel: ["analytics.read"],
  googlesheets: ["files.read", "files.write"],
  googledocs: ["files.read", "files.write"],
  airtable: ["files.read", "files.write"],
};

// Kept for the module-availability endpoint's coarse gating (distinct
// from Opportunity-engine "impacted modules", which reads compatibleModules
// on each capability directly for finer-grained per-capability impact).
export const MODULE_REQUIREMENTS: Record<string, CapabilityId[]> = {
  smartInbox: ["email.read"],
  calendar: ["calendar.read"],
  shopOptimizer: ["commerce.products.read", "commerce.orders.read"],
  marketing: ["ads.read"],
  finance: ["payments.read"],
  crmSync: ["crm.contacts.read"],
  documents: ["files.read"],
  notifications: ["messaging.send"],
};

export function capabilitiesForProvider(provider: string): CapabilityId[] {
  return PROVIDER_CAPABILITIES[provider] ?? [];
}

export function providersForCapability(capability: CapabilityId): string[] {
  return Object.entries(PROVIDER_CAPABILITIES)
    .filter(([, caps]) => caps.includes(capability))
    .map(([provider]) => provider);
}
