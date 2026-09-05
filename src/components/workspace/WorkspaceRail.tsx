import { useState } from "react";
import { NavLink as RouterNavLink, useNavigate, useParams } from "react-router-dom";
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
  Target, Briefcase, Search,
  Send, Phone, Megaphone,
  FileText, CreditCard,
  UserCheck, Clock, CalendarDays, CalendarClock, Wallet, UserPlus, BarChart3,
  Workflow, Plug, Brain, Zap, Bot, BookOpen, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useMyBlockedModules, type ModuleKey } from "@/hooks/api/useModuleAccess";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  dataTour?: string;
}

interface NavGroup {
  label: string | null;
  eyebrow?: string;
  module: ModuleKey | null;
  items: NavItem[];
}

function useNavGroups(): NavGroup[] {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  return [
    {
      label: null,
      eyebrow: "Start",
      module: null,
      items: [
        { label: t("nav.dashboard") || "Dashboard", path: "dashboard", icon: LayoutDashboard, dataTour: "dashboard" },
        { label: t("nav.clients"), path: "clients", icon: Building2 },
        { label: t("nav.calendar") || "Kalender", path: "work/calendar", icon: Calendar },
        { label: t("nav.tasks") || "Opgaver", path: "work/tasks", icon: CheckSquare },
        { label: t("nav.smartInbox") || "Indbakke", path: "email/emails", icon: Inbox },
      ],
    },
    {
      label: t("nav.crm") || "CRM",
      eyebrow: "Pipeline",
      module: "crm",
      items: [
        { label: t("nav.leads") || "Leads", path: "crm/leads", icon: Target, dataTour: "leads" },
        { label: t("nav.deals") || "Deals", path: "crm/deals", icon: Briefcase, dataTour: "pipeline" },
        { label: t("nav.leadGeneration") || "Lead Gen", path: "crm/lead-generation", icon: Search },
      ],
    },
    {
      label: t("nav.marketing") || "Marketing",
      eyebrow: "Outbound",
      module: "marketing",
      items: [
        { label: t("nav.coldCaller") || "Power Dialer", path: "marketing/cold-caller", icon: Phone },
        { label: t("nav.bulkEmail") || "Bulk email", path: "email/bulk", icon: Send },
        { label: t("nav.metaAds") || "Meta Ads", path: "marketing/meta-ads", icon: Megaphone },
      ],
    },
    {
      label: t("nav.finance") || "Finance",
      eyebrow: "Cashflow",
      module: "finance",
      items: [
        { label: t("nav.invoices") || "Fakturaer", path: "finance/invoices", icon: FileText },
        { label: t("nav.quotes") || "Tilbud", path: "finance/quotes", icon: FileText },
        { label: t("nav.payments") || "Betalinger", path: "finance/payments", icon: CreditCard },
      ],
    },
    {
      label: t("nav.hr") || "HR",
      eyebrow: "People",
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
      label: locale === "da" ? "Kontrolrum" : "Control room",
      eyebrow: "Workspace",
      module: "system",
      items: [
        { label: t("nav.studio"), path: "workspace/studio", icon: Workflow },
        { label: t("nav.connectedApps"), path: "workspace/connected-apps", icon: Plug },
        { label: locale === "da" ? "Indsigter" : "Insights", path: "workspace/intelligence", icon: Brain },
        { label: locale === "da" ? "Automatisering" : "Automation", path: "autopilot", icon: Zap },
        { label: locale === "da" ? "Assistent" : "Assistant", path: "pa", icon: Bot, dataTour: "pa" },
        { label: t("nav.help"), path: "help", icon: BookOpen },
        { label: t("nav.settings") || "Indstillinger", path: "settings/company", icon: Settings, dataTour: "settings" },
      ],
    },
  ];
}

interface Props {
  onOpenPalette: () => void;
}

function RailContent({ onNavigate }: { onNavigate?: () => void }) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { t } = useI18n();
  const allGroups = useNavGroups();
  const blockedModules = useMyBlockedModules();
  const groups = allGroups.filter(g => !g.module || !blockedModules.has(g.module));

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const jumpLabels = [
    { label: t("nav.crm"), module: "crm" as const, code: "CRM" },
    { label: t("nav.marketing"), module: "marketing" as const, code: "MKT" },
    { label: t("nav.finance"), module: "finance" as const, code: "FIN" },
    { label: t("nav.hr"), module: "hr" as const, code: "HR" },
  ].filter(item => !blockedModules.has(item.module));

  return (
    <div className="flex h-full w-full flex-col bg-sidebar-background text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border/80 px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-sidebar-border bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)] dark:bg-sidebar-accent">
            <img src={logo} alt="AI Agency Danmark" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-sidebar-foreground">
              Agency Danmark
            </div>
            <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted">
              Operating Suite
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-md border border-sidebar-border/70 bg-white/60 p-1 dark:bg-sidebar-accent/40">
          {jumpLabels.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                const targetGroup = groups.find(group => group.label === item.label);
                const firstItem = targetGroup?.items[0];
                if (firstItem) { navigate(`${base}/${firstItem.path}`); onNavigate?.(); }
              }}
              className="h-8 rounded-[5px] text-[10px] font-semibold text-sidebar-muted transition-colors hover:bg-sidebar-background hover:text-sidebar-foreground"
              title={item.label}
            >
              {item.code}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {groups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="space-y-1">
            {(group.label || group.eyebrow) && (
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                  {group.label ?? group.eyebrow}
                </span>
                {group.eyebrow && group.label && (
                  <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-sidebar-muted/70">
                    {group.eyebrow}
                  </span>
                )}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.path}>
                  <RouterNavLink
                    to={`${base}/${item.path}`}
                    onClick={onNavigate}
                    data-tour={item.dataTour}
                    end
                    className={({ isActive }) => cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                      isActive
                        ? "bg-white text-sidebar-foreground shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-sidebar-border dark:bg-sidebar-accent"
                        : "text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[5px] transition-colors", isActive ? "bg-stamp text-stamp-foreground" : "bg-sidebar-accent text-sidebar-muted group-hover:text-sidebar-foreground")}>
                          <item.icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
                        </span>
                        <span className="truncate font-medium">{item.label}</span>
                        {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-muted" />}
                      </>
                    )}
                  </RouterNavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: user + account menu */}
      <div className="shrink-0 border-t border-sidebar-border/80 bg-sidebar-background p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent" aria-label={t("nav.accountMenu")}>
              <Avatar className="h-8 w-8 shrink-0 rounded-md">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="rounded-md bg-stamp text-[11px] font-semibold text-stamp-foreground">{initials}</AvatarFallback>
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
  const { t } = useI18n();
  return (
    // Desktop: permanently expanded, normal flex sibling — never overlaps content, always legible
    <aside
      className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-sidebar-border/60"
      aria-label={t("nav.workspaceNavigation")}
    >
      <RailContent />
    </aside>
  );
}

export function WorkspaceRailMobileTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground hover:text-foreground md:hidden"
          aria-label={t("nav.openMenu")}
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72">
        <SheetTitle className="sr-only">{t("nav.workspaceNavigation")}</SheetTitle>
        <RailContent onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
