import {
  LayoutDashboard, Users, Briefcase, TrendingUp, Sparkles, Target,
  FileText, CreditCard, Receipt, Zap, Workflow,
  UserCheck, Clock, CalendarDays, CalendarClock, UserPlus, Wallet, BarChart3,
  Mail, Send, Megaphone, Phone, Bot, Plug, Brain,
  CheckSquare, Calendar, Inbox, Settings, Webhook, BookOpen, Activity, Building2,
  type LucideIcon,
} from "lucide-react";

export type ModeId = "overview" | "sales" | "operations" | "people";

export interface Destination {
  label: string;
  path: string;          // relative to base e.g. "crm/leads"
  icon: LucideIcon;
  modes: ModeId[];       // which modes surface this in the rail
}

export interface Mode {
  id: ModeId;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const MODES: Mode[] = [
  { id: "overview", label: "Overblik", icon: LayoutDashboard, hint: "Hjem, klienter, kalender" },
  { id: "sales",    label: "Salg",     icon: TrendingUp,      hint: "Leads, deals, kommunikation" },
  { id: "operations", label: "Drift",  icon: Receipt,         hint: "Fakturaer, betalinger, automation" },
  { id: "people",   label: "Folk",     icon: Users,           hint: "Medarbejdere, tid, løn" },
];

export const DESTINATIONS: Destination[] = [
  // Overview
  { label: "Dashboard",   path: "dashboard",        icon: LayoutDashboard, modes: ["overview"] },
  { label: "Klienter",    path: "clients",          icon: Building2,       modes: ["overview", "sales", "operations"] },
  { label: "Kalender",    path: "work/calendar",    icon: Calendar,        modes: ["overview", "people"] },
  { label: "Opgaver",     path: "work/tasks",       icon: CheckSquare,     modes: ["overview", "sales", "operations", "people"] },
  { label: "Indbakke",    path: "email/emails",     icon: Inbox,           modes: ["overview", "sales"] },

  // Sales
  { label: "Leads",         path: "crm/leads",          icon: Target,    modes: ["sales"] },
  { label: "Pipeline",      path: "crm/pipeline",       icon: TrendingUp, modes: ["sales"] },
  { label: "Deals",         path: "crm/deals",          icon: Briefcase, modes: ["sales"] },
  { label: "Lead Gen",      path: "crm/lead-generation", icon: Sparkles, modes: ["sales"] },
  { label: "Bulk email",    path: "email/bulk",         icon: Send,      modes: ["sales"] },
  { label: "Cold caller",   path: "marketing/cold-caller", icon: Phone,  modes: ["sales"] },
  { label: "Meta Ads",      path: "marketing/meta-ads", icon: Megaphone, modes: ["sales"] },

  // Operations
  { label: "Fakturaer",   path: "finance/invoices", icon: FileText,    modes: ["operations"] },
  { label: "Tilbud",      path: "finance/quotes",   icon: FileText,    modes: ["operations"] },
  { label: "Betalinger",  path: "finance/payments", icon: CreditCard,  modes: ["operations"] },
  { label: "Studio",      path: "workspace/studio", icon: Workflow,    modes: ["operations"] },
  { label: "Forbundne",   path: "workspace/connected-apps", icon: Plug, modes: ["operations", "overview"] },
  { label: "Intelligens", path: "workspace/intelligence",   icon: Brain, modes: ["overview", "sales", "operations"] },
  { label: "Autopilot",   path: "autopilot",        icon: Zap,         modes: ["operations"] },

  // People
  { label: "Medarbejdere",  path: "hr/employees",     icon: UserCheck,    modes: ["people"] },
  { label: "Tidsregistrering", path: "hr/time-tracking", icon: Clock,     modes: ["people"] },
  { label: "Fremmøde",      path: "hr/attendance",    icon: Activity,     modes: ["people"] },
  { label: "Vagtplan",      path: "hr/work-schedule", icon: CalendarDays, modes: ["people"] },
  { label: "Fravær",        path: "hr/leave",         icon: CalendarClock, modes: ["people"] },
  { label: "Løn",           path: "hr/payroll",       icon: Wallet,       modes: ["people"] },
  { label: "Rekruttering",  path: "hr/recruitment",   icon: UserPlus,     modes: ["people"] },
  { label: "Workforce",     path: "hr/workforce",     icon: BarChart3,    modes: ["people"] },
];

// Always visible at the bottom of the rail (across all modes)
export const PINNED: Destination[] = [
  { label: "Assistent", path: "pa",              icon: Bot,      modes: [] },
  { label: "Hjælp",     path: "help",            icon: BookOpen, modes: [] },
  { label: "Indstil.",  path: "settings/company", icon: Settings, modes: [] },
];

export function detectModeFromPath(pathname: string): ModeId {
  if (/\/(crm|email\/bulk|marketing)/.test(pathname)) return "sales";
  if (/\/(finance|autopilot|workflows|workspace)/.test(pathname)) return "operations";
  if (/\/hr\//.test(pathname)) return "people";
  return "overview";
}
