import {
  LayoutDashboard, Users, Briefcase, TrendingUp, Sparkles, Target,
  FileText, CreditCard, Receipt, Zap, Workflow,
  UserCheck, Clock, CalendarDays, CalendarClock, UserPlus, Wallet, BarChart3,
  Send, Megaphone, Phone, Bot, Plug, Brain,
  CheckSquare, Calendar, Inbox, Settings, BookOpen, Activity, Building2,
  type LucideIcon,
} from "lucide-react";

export type ModeId = "overview" | "sales" | "operations" | "people";

export interface Destination {
  /** Translation key resolved via t() at render time — not a literal label. */
  labelKey: string;
  path: string;          // relative to base e.g. "crm/leads"
  icon: LucideIcon;
  modes: ModeId[];       // which modes surface this in the rail
}

export interface Mode {
  id: ModeId;
  labelKey: string;
  icon: LucideIcon;
  hintKey: string;
}

export const MODES: Mode[] = [
  { id: "overview", labelKey: "command.modeOverview", icon: LayoutDashboard, hintKey: "command.modeOverviewHint" },
  { id: "sales",    labelKey: "command.modeSales",     icon: TrendingUp,      hintKey: "command.modeSalesHint" },
  { id: "operations", labelKey: "command.modeOperations", icon: Receipt,      hintKey: "command.modeOperationsHint" },
  { id: "people",   labelKey: "command.modePeople",    icon: Users,           hintKey: "command.modePeopleHint" },
];

export const DESTINATIONS: Destination[] = [
  // Overview
  { labelKey: "nav.dashboard",   path: "dashboard",        icon: LayoutDashboard, modes: ["overview"] },
  { labelKey: "nav.clients",    path: "clients",          icon: Building2,       modes: ["overview", "sales", "operations"] },
  { labelKey: "nav.calendar",    path: "work/calendar",    icon: Calendar,        modes: ["overview", "people"] },
  { labelKey: "nav.tasks",     path: "work/tasks",       icon: CheckSquare,     modes: ["overview", "sales", "operations", "people"] },
  { labelKey: "nav.smartInbox",    path: "email/emails",     icon: Inbox,           modes: ["overview", "sales"] },

  // Sales
  { labelKey: "nav.leads",         path: "crm/leads",          icon: Target,    modes: ["sales"] },
  { labelKey: "nav.deals",         path: "crm/deals",          icon: Briefcase, modes: ["sales"] },
  { labelKey: "nav.leadGeneration",      path: "crm/lead-generation", icon: Sparkles, modes: ["sales"] },
  { labelKey: "nav.coldCaller",   path: "marketing/cold-caller", icon: Phone,  modes: ["sales"] },
  { labelKey: "nav.bulkEmail",    path: "email/bulk",         icon: Send,      modes: ["sales"] },
  { labelKey: "nav.metaAds",      path: "marketing/meta-ads", icon: Megaphone, modes: ["sales"] },

  // Operations
  { labelKey: "nav.invoices",   path: "finance/invoices", icon: FileText,    modes: ["operations"] },
  { labelKey: "nav.quotes",      path: "finance/quotes",   icon: FileText,    modes: ["operations"] },
  { labelKey: "nav.payments",  path: "finance/payments", icon: CreditCard,  modes: ["operations"] },
  { labelKey: "nav.workflowStudio", path: "workspace/studio", icon: Workflow,    modes: ["operations"] },
  { labelKey: "nav.connectedApps",   path: "workspace/connected-apps", icon: Plug, modes: ["operations", "overview"] },
  { labelKey: "nav.documents",  path: "workspace/documents", icon: FileText, modes: ["operations", "overview"] },
  { labelKey: "nav.aiProvider",  path: "settings/ai", icon: Bot, modes: ["operations", "overview"] },
  { labelKey: "nav.insights", path: "workspace/intelligence",   icon: Brain, modes: ["overview", "sales", "operations"] },
  { labelKey: "nav.automation",   path: "autopilot",        icon: Zap,         modes: ["operations"] },

  // People
  { labelKey: "nav.employees",  path: "hr/employees",     icon: UserCheck,    modes: ["people"] },
  { labelKey: "nav.timeTracking", path: "hr/time-tracking", icon: Clock,     modes: ["people"] },
  { labelKey: "nav.attendance",      path: "hr/attendance",    icon: Activity,     modes: ["people"] },
  { labelKey: "nav.workSchedule",      path: "hr/work-schedule", icon: CalendarDays, modes: ["people"] },
  { labelKey: "nav.leave",        path: "hr/leave",         icon: CalendarClock, modes: ["people"] },
  { labelKey: "nav.payroll",           path: "hr/payroll",       icon: Wallet,       modes: ["people"] },
  { labelKey: "nav.recruitment",  path: "hr/recruitment",   icon: UserPlus,     modes: ["people"] },
  { labelKey: "nav.workforceDashboard",     path: "hr/workforce",     icon: BarChart3,    modes: ["people"] },
];

// Always visible at the bottom of the rail (across all modes)
export const PINNED: Destination[] = [
  { labelKey: "nav.assistant", path: "pa",              icon: Bot,      modes: [] },
  { labelKey: "nav.help",     path: "help",            icon: BookOpen, modes: [] },
  { labelKey: "nav.settings",  path: "settings/company", icon: Settings, modes: [] },
];

export function detectModeFromPath(pathname: string): ModeId {
  if (/\/(crm|email\/bulk|marketing)/.test(pathname)) return "sales";
  if (/\/(finance|autopilot|workflows|workspace)/.test(pathname)) return "operations";
  if (/\/hr\//.test(pathname)) return "people";
  return "overview";
}
