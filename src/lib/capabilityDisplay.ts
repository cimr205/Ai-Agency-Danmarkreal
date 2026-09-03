// Frontend-only display copy for the "Workspace Upgrade" moment shown
// right after a connection completes. Mirrors (but is not authoritative
// for) supabase/functions/_shared/integration-taxonomy.ts — the DB-backed
// workspace_capabilities table is the source of truth for what's actually
// available; this only supplies human-readable labels for the toast so we
// don't need a round trip just to say what a provider unlocks.
export interface CapabilityDisplayInfo {
  name: string;
  modules: string[];
}

export const CAPABILITY_DISPLAY: Record<string, CapabilityDisplayInfo> = {
  "email.send": { name: "Send email", modules: ["Leads", "Deals", "Bulk Email", "Invoices"] },
  "email.read": { name: "Read email", modules: ["Smart Inbox", "Leads", "Deals"] },
  "calendar.read": { name: "Read calendar", modules: ["Leads", "Deals", "Tasks"] },
  "calendar.write": { name: "Book meetings", modules: ["Leads", "Deals", "Tasks"] },
  "crm.contacts.read": { name: "Read external contacts", modules: ["Leads", "Customers"] },
  "crm.contacts.write": { name: "Write external contacts", modules: ["Leads", "Customers"] },
  "crm.deals.read": { name: "Read external deals", modules: ["Deals"] },
  "crm.deals.write": { name: "Write external deals", modules: ["Deals"] },
  "commerce.products.read": { name: "Read products", modules: ["Marketing"] },
  "commerce.products.write": { name: "Write products", modules: ["Marketing"] },
  "commerce.orders.read": { name: "Read orders", modules: ["Marketing", "Finance"] },
  "ads.read": { name: "Read ad performance", modules: ["Marketing"] },
  "ads.manage": { name: "Manage ad campaigns", modules: ["Marketing"] },
  "ads.leads.read": { name: "Import ad leads", modules: ["Marketing", "Leads"] },
  "payments.read": { name: "Read payments", modules: ["Invoices", "Finance"] },
  "payments.events": { name: "Payment webhooks", modules: ["Invoices", "Finance"] },
  "files.read": { name: "Search files", modules: ["Leads", "Deals", "Invoices"] },
  "files.write": { name: "Store files", modules: ["Leads", "Deals", "Invoices"] },
  "messaging.send": { name: "Send notifications", modules: ["Tasks"] },
  "analytics.read": { name: "Read analytics", modules: ["Marketing"] },
};

export const PROVIDER_CAPABILITY_IDS: Record<string, string[]> = {
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

export function unlockedModulesForProvider(provider: string): { capabilityNames: string[]; moduleNames: string[] } {
  const capIds = PROVIDER_CAPABILITY_IDS[provider] ?? [];
  const capabilityNames = capIds.map((id) => CAPABILITY_DISPLAY[id]?.name).filter((v): v is string => !!v);
  const moduleNames = [...new Set(capIds.flatMap((id) => CAPABILITY_DISPLAY[id]?.modules ?? []))];
  return { capabilityNames, moduleNames };
}
