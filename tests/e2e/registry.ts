/**
 * Module registry — the single source of truth for QA coverage.
 * Every real route in src/App.tsx is listed here with its module, auth
 * requirement and role gate, so specs and the coverage report stay in sync.
 */
export type Access = "public" | "auth" | "company_admin" | "system_admin";

export interface RouteEntry {
  module: string;
  label: string;
  path: string; // relative to /:locale (no leading slash)
  access: Access;
}

export const LOCALE = "en";

/** Public, unauthenticated routes — testable right now without credentials. */
export const PUBLIC_ROUTES: RouteEntry[] = [
  { module: "auth", label: "Login", path: "auth/login", access: "public" },
  { module: "auth", label: "Signup", path: "auth/signup", access: "public" },
  { module: "auth", label: "Forgot password", path: "auth/forgot-password", access: "public" },
  { module: "auth", label: "Join company", path: "auth/join-company", access: "public" },
  { module: "legal", label: "Privacy policy", path: "privacy", access: "public" },
  { module: "legal", label: "Terms of service", path: "terms", access: "public" },
  { module: "legal", label: "Data processing agreement", path: "dpa", access: "public" },
];

/** Authenticated app routes (base /:locale/app/...). Require test credentials. */
export const APP_ROUTES: RouteEntry[] = [
  { module: "dashboard", label: "Dashboard", path: "app/dashboard", access: "auth" },
  { module: "crm", label: "Leads", path: "app/crm/leads", access: "auth" },
  { module: "crm", label: "Deals", path: "app/crm/deals", access: "auth" },
  { module: "crm", label: "Lead Generation", path: "app/crm/lead-generation", access: "auth" },
  { module: "crm", label: "ICP Finder", path: "app/crm/icp", access: "auth" },
  { module: "clients", label: "Clients", path: "app/clients", access: "auth" },
  { module: "finance", label: "Invoices", path: "app/finance/invoices", access: "auth" },
  { module: "finance", label: "Quotes", path: "app/finance/quotes", access: "auth" },
  { module: "finance", label: "Payments", path: "app/finance/payments", access: "auth" },
  { module: "work", label: "Tasks", path: "app/work/tasks", access: "auth" },
  { module: "work", label: "Calendar", path: "app/work/calendar", access: "auth" },
  { module: "work", label: "Messages (inbox)", path: "app/work/inbox", access: "auth" },
  { module: "email", label: "Emails", path: "app/email/emails", access: "auth" },
  { module: "email", label: "Bulk email", path: "app/email/bulk", access: "auth" },
  { module: "email", label: "Templates", path: "app/email/templates", access: "auth" },
  { module: "marketing", label: "Meta Ads", path: "app/marketing/meta-ads", access: "auth" },
  { module: "marketing", label: "Power Dialer", path: "app/marketing/cold-caller", access: "auth" },
  { module: "marketing", label: "Voice Agent", path: "app/marketing/voice-agent", access: "auth" },
  { module: "ai", label: "AI Media", path: "app/ai/media", access: "auth" },
  { module: "ai", label: "Personal Assistant", path: "app/pa", access: "auth" },
  { module: "automation", label: "Autopilot", path: "app/autopilot", access: "auth" },
  { module: "workspace", label: "Workflow Studio", path: "app/workspace/studio", access: "auth" },
  { module: "workspace", label: "Workflow Chat", path: "app/workspace/workflow-chat", access: "auth" },
  { module: "workspace", label: "Operating Manager", path: "app/workspace/operating-manager", access: "auth" },
  { module: "workspace", label: "Connected Apps", path: "app/workspace/connected-apps", access: "auth" },
  { module: "workspace", label: "Documents", path: "app/workspace/documents", access: "auth" },
  { module: "workspace", label: "Intelligence", path: "app/workspace/intelligence", access: "auth" },
  { module: "hr", label: "Employees", path: "app/hr/employees", access: "company_admin" },
  { module: "hr", label: "Attendance", path: "app/hr/attendance", access: "auth" },
  { module: "hr", label: "Time Tracking", path: "app/hr/time-tracking", access: "auth" },
  { module: "hr", label: "Work Schedule", path: "app/hr/work-schedule", access: "auth" },
  { module: "hr", label: "Leave", path: "app/hr/leave", access: "auth" },
  { module: "hr", label: "Payroll", path: "app/hr/payroll", access: "company_admin" },
  { module: "hr", label: "Recruitment", path: "app/hr/recruitment", access: "company_admin" },
  { module: "hr", label: "Workforce", path: "app/hr/workforce", access: "company_admin" },
  { module: "hr", label: "Reports", path: "app/hr/reports", access: "company_admin" },
  { module: "settings", label: "Company Settings", path: "app/settings/company", access: "auth" },
  { module: "settings", label: "Profile", path: "app/settings/profile", access: "auth" },
  { module: "settings", label: "Invitations", path: "app/settings/invitations", access: "company_admin" },
  { module: "settings", label: "Webhooks", path: "app/settings/webhooks", access: "company_admin" },
  { module: "settings", label: "AI Connection", path: "app/settings/ai", access: "company_admin" },
  { module: "system", label: "Monitoring", path: "app/monitoring", access: "company_admin" },
  { module: "system", label: "Help Center", path: "app/help", access: "auth" },
  { module: "system", label: "Subscription", path: "app/subscription", access: "auth" },
  { module: "onboarding", label: "Onboarding", path: "app/onboarding", access: "auth" },
  { module: "admin", label: "Admin Overview", path: "admin/overview", access: "system_admin" },
  { module: "admin", label: "Admin Companies", path: "admin/companies", access: "system_admin" },
  { module: "admin", label: "Admin Users", path: "admin/users", access: "system_admin" },
  { module: "admin", label: "Admin Contact Submissions", path: "admin/contacts", access: "system_admin" },
  { module: "admin", label: "Admin Settings", path: "admin/settings", access: "system_admin" },
];

export const ALL_ROUTES = [...PUBLIC_ROUTES, ...APP_ROUTES];
export const MODULES = [...new Set(ALL_ROUTES.map((r) => r.module))];
