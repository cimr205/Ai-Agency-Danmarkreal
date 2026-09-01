import { useState } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut, User, Settings, Menu, type LucideIcon,
  LayoutDashboard, Building2, Calendar, CheckSquare, Inbox,
  Target, Briefcase, Radar,
  Send, Phone, Megaphone,
  FileText, CreditCard,
  UserCheck, Clock, CalendarDays, CalendarClock, Wallet, UserPlus, BarChart3,
  Workflow, Plug, Activity, Route, MessageSquareText, BookOpen, ServerCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyBlockedModules, type ModuleKey } from "@/hooks/api/useModuleAccess";
import { BrandWordmark } from "@/components/brand/BrandMark";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  dataTour?: string;
}

interface NavGroup {
  label: string | null;
  module: ModuleKey | null;
  items: NavItem[];
}

function useNavGroups(): NavGroup[] {
  const { t } = useI18n();
  return [
    {
      label: null,
      module: null,
      items: [
        { label: t("nav.dashboard") || "Dashboard", path: "dashboard", icon: LayoutDashboard, dataTour: "dashboard" },
        { label: "Klienter", path: "clients", icon: Building2 },
        { label: t("nav.calendar") || "Kalender", path: "work/calendar", icon: Calendar },
        { label: t("nav.tasks") || "Opgaver", path: "work/tasks", icon: CheckSquare },
        { label: t("nav.smartInbox") || "Indbakke", path: "email/emails", icon: Inbox },
      ],
    },
    {
      label: t("nav.crm") || "CRM",
      module: "crm",
      items: [
        { label: t("nav.leads") || "Leads", path: "crm/leads", icon: Target, dataTour: "leads" },
        { label: t("nav.deals") || "Deals", path: "crm/deals", icon: Briefcase, dataTour: "pipeline" },
        { label: t("nav.leadGeneration") || "Lead Gen", path: "crm/lead-generation", icon: Radar },
        { label: t("nav.coldCaller") || "Cold caller", path: "marketing/cold-caller", icon: Phone },
      ],
    },
    {
      label: t("nav.marketing") || "Marketing",
      module: "marketing",
      items: [
        { label: t("nav.bulkEmail") || "Bulk email", path: "email/bulk", icon: Send },
        { label: t("nav.metaAds") || "Meta Ads", path: "marketing/meta-ads", icon: Megaphone },
      ],
    },
    {
      label: t("nav.finance") || "Finance",
      module: "finance",
      items: [
        { label: t("nav.invoices") || "Fakturaer", path: "finance/invoices", icon: FileText },
        { label: t("nav.quotes") || "Tilbud", path: "finance/quotes", icon: FileText },
        { label: t("nav.payments") || "Betalinger", path: "finance/payments", icon: CreditCard },
      ],
    },
    {
      label: t("nav.hr") || "HR",
      module: "hr",
      items: [
        { label: t("nav.employees") || "Medarbejdere", path: "hr/employees", icon: UserCheck },
        { label: t("nav.timeTracking") || "Tidsregistrering", path: "hr/time-tracking", icon: Clock },
        { label: t("nav.attendance") || "Fremmøde", path: "hr/attendance", icon: CalendarDays },
        { label: t("nav.workSchedule") || "Vagtplan", path: "hr/work-schedule", icon: CalendarDays },
        { label: t("nav.leave") || "Fravær", path: "hr/leave", icon: CalendarClock },
        { label: t("nav.payroll") || "Løn", path: "hr/payroll", icon: Wallet },
        { label: t("nav.recruitment") || "Rekruttering", path: "hr/recruitment", icon: UserPlus },
        { label: t("nav.workforceDashboard") || "Workforce", path: "hr/workforce", icon: BarChart3 },
      ],
    },
    {
      label: t("nav.system") || "System",
      module: "system",
      items: [
        { label: "Studio", path: "workspace/studio", icon: Workflow },
        { label: "Forbundne apps", path: "workspace/connected-apps", icon: Plug },
        { label: "Dokumenter", path: "workspace/documents", icon: FileText },
        { label: "Modeludbyder", path: "settings/ai", icon: ServerCog },
        { label: "Signaler", path: "workspace/intelligence", icon: Activity },
        { label: "Autopilot", path: "autopilot", icon: Route },
        { label: t("nav.clowdbot") || "Assistent", path: "pa", icon: MessageSquareText, dataTour: "pa" },
        { label: "Hjælp", path: "help", icon: BookOpen },
        { label: t("nav.settings") || "Indstillinger", path: "settings/company", icon: Settings, dataTour: "settings" },
      ],
    },
  ];
}

interface Props {
  onOpenPalette: () => void;
}

type WorkspaceArea = "home" | "sales" | "operations" | "people";

const AREA_TARGETS: Record<WorkspaceArea, string> = {
  home: "dashboard",
  sales: "crm/leads",
  operations: "finance/invoices",
  people: "hr/employees",
};

function detectWorkspaceArea(pathname: string): WorkspaceArea {
  if (/\/hr\//.test(pathname)) return "people";
  if (/\/(finance|workspace|settings|autopilot|help|pa)(\/|$)/.test(pathname)) return "operations";
  if (/\/(crm|marketing|email\/bulk)(\/|$)/.test(pathname)) return "sales";
  return "home";
}

function RailContent({ onNavigate }: { onNavigate?: () => void }) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { t } = useI18n();
  const allGroups = useNavGroups();
  const blockedModules = useMyBlockedModules();
  const groups = allGroups.filter(g => !g.module || !blockedModules.has(g.module));

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const activeArea = detectWorkspaceArea(location.pathname);
  const workspaces: Array<{ id: WorkspaceArea; label: string; disabled?: boolean }> = [
    { id: "home", label: locale === "da" ? "Overblik" : "Home" },
    { id: "sales", label: locale === "da" ? "Salg" : "Sales", disabled: blockedModules.has("crm") && blockedModules.has("marketing") },
    { id: "operations", label: locale === "da" ? "Drift" : "Ops", disabled: blockedModules.has("finance") },
    { id: "people", label: locale === "da" ? "Team" : "People", disabled: blockedModules.has("hr") },
  ];

  const visibleGroups = groups.filter((group) => {
    if (group.module === null) return true;
    if (activeArea === "sales") return group.module === "crm" || group.module === "marketing";
    if (activeArea === "operations") return group.module === "finance" || group.module === "system";
    if (activeArea === "people") return group.module === "hr";
    return false;
  });

  const selectWorkspace = (area: WorkspaceArea) => {
    navigate(`${base}/${AREA_TARGETS[area]}`);
    onNavigate?.();
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar-background text-sidebar-foreground">
      <div className="flex h-[64px] shrink-0 items-center border-b border-sidebar-border px-4">
        <BrandWordmark />
      </div>

      <div className="shrink-0 border-b border-sidebar-border" aria-label="Switch workspace">
        <div className="grid grid-cols-4 divide-x divide-sidebar-border">
          {workspaces.map((workspace, index) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => selectWorkspace(workspace.id)}
              disabled={workspace.disabled}
              className={cn(
                "flex h-[58px] flex-col items-start justify-center gap-1 px-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-25",
                activeArea === workspace.id
                  ? "bg-sidebar-foreground text-sidebar"
                  : "text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <span className={cn(
                "font-mono text-[8px] tabular-nums tracking-[0.14em]",
                activeArea === workspace.id ? "text-primary" : "text-sidebar-foreground/30",
              )}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.08em]">{workspace.label}</span>
            </button>
          ))}
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-7 overflow-y-auto px-3 py-5">
        {visibleGroups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`}>
            <div className="mb-2.5 flex items-center gap-2 px-2">
              <span className="font-mono text-[8px] tabular-nums tracking-[0.16em] text-primary">
                {String(gi + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-[8px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/38">
                {group.label || (locale === "da" ? "Fælles" : "Workspace")}
              </span>
              <span className="h-px flex-1 bg-sidebar-border" />
            </div>
            <ul className="space-y-px">
              {group.items.map((item, itemIndex) => (
                <li key={item.path}>
                  <RouterNavLink
                    to={`${base}/${item.path}`}
                    onClick={onNavigate}
                    data-tour={item.dataTour}
                    end
                    className={({ isActive }) => cn(
                      "group relative grid min-h-9 grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 px-2.5 text-[12.5px] transition-colors",
                      isActive
                        ? "bg-sidebar-foreground font-medium text-sidebar"
                        : "text-sidebar-foreground/62 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cn(
                          "font-mono text-[8px] tabular-nums tracking-[0.12em]",
                          isActive ? "text-sidebar/45" : "text-sidebar-foreground/28",
                        )}>
                          {String(itemIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{item.label}</span>
                        <span className="grid h-[18px] w-[18px] place-items-center">
                          {isActive ? (
                            <span className="h-1.5 w-1.5 bg-primary" />
                          ) : (
                            <item.icon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-45" strokeWidth={1.7} />
                          )}
                        </span>
                      </>
                    )}
                  </RouterNavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border bg-sidebar-background p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 border border-transparent px-2 py-2 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent">
              <Avatar className="h-8 w-8 shrink-0 rounded-sm">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="rounded-sm bg-primary text-[10px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium truncate leading-tight">{profile?.full_name || profile?.email}</p>
                <p className="text-[10.5px] text-sidebar-foreground/45 truncate leading-tight mt-px">{profile?.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm">{profile?.full_name || profile?.email}</div>
              {profile?.full_name && <div className="truncate text-xs text-muted-foreground">{profile.email}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`${base}/settings/profile`)}>
              <User className="h-4 w-4 mr-2" /> {t("nav.profile") || "Profil"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`${base}/settings/company`)}>
              <Settings className="h-4 w-4 mr-2" /> {t("nav.settings") || "Indstillinger"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try { await logout(); } finally { navigate(`/${locale}/auth/login`, { replace: true }); }
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" /> {t("common.signOut") || "Log ud"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function WorkspaceRail(_props: Props) {
  return (
    // Desktop: permanently expanded, normal flex sibling — never overlaps content, always legible
    <aside
      className="sticky top-0 hidden h-screen w-[228px] shrink-0 border-r border-sidebar-border md:flex md:flex-col"
      aria-label="Workspace navigation"
    >
      <RailContent />
    </aside>
  );
}

export function WorkspaceRailMobileTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <button
          className="grid h-9 w-9 shrink-0 place-items-center border border-border bg-card text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[264px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <RailContent onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
