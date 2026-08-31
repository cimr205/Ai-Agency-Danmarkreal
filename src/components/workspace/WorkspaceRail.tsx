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
  Target, Briefcase, Sparkles,
  Send, Phone, Megaphone,
  FileText, CreditCard,
  UserCheck, Clock, CalendarDays, CalendarClock, Wallet, UserPlus, BarChart3,
  Workflow, Plug, Brain, Zap, Bot, BookOpen,
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
        { label: t("nav.leadGeneration") || "Lead Gen", path: "crm/lead-generation", icon: Sparkles },
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
        { label: "Intelligens", path: "workspace/intelligence", icon: Brain },
        { label: "Autopilot", path: "autopilot", icon: Zap },
        { label: t("nav.clowdbot") || "Assistent", path: "pa", icon: Bot, dataTour: "pa" },
        { label: "Hjælp", path: "help", icon: BookOpen },
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

  const [filter, setFilter] = useState<string | null>(null);

  const toggleFilter = (label: string) => {
    setFilter(prev => {
      const next = prev === label ? null : label;
      if (next) {
        // Clicking a category should land you in it, not just filter the
        // sidebar — otherwise the tab looks broken (URL/content never change).
        const targetGroup = groups.find(g => g.label === next);
        const firstItem = targetGroup?.items[0];
        if (firstItem) { navigate(`${base}/${firstItem.path}`); onNavigate?.(); }
      }
      return next;
    });
  };

  const jumpLabels = [
    { key: "crm", label: t("nav.crm"), module: "crm" as const },
    { key: "hr", label: t("nav.hr"), module: "hr" as const },
    { key: "marketing", label: t("nav.marketing"), module: "marketing" as const },
    { key: "finance", label: t("nav.finance"), module: "finance" as const },
  ].filter(jl => !blockedModules.has(jl.module));

  const visibleGroups = filter ? groups.filter(g => g.label === filter) : groups;

  return (
    <div className="flex h-full w-full flex-col bg-sidebar-background text-sidebar-foreground">
      {/* Header: wordmark + filter pills */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2.5 mb-4">
          <img src={logo} alt="" className="h-6 w-6 object-contain shrink-0 opacity-95" />
          <div
            className="font-normal italic text-[18px] leading-none truncate"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
          >
            AI Agency
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {jumpLabels.map((jl) => (
            <button
              key={jl.key}
              type="button"
              onClick={() => toggleFilter(jl.label)}
              className={cn(
                "text-[10.5px] font-medium px-2.5 py-1 rounded-full transition-colors",
                filter === jl.label
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-accent text-sidebar-foreground/55 hover:text-sidebar-foreground",
              )}
            >
              {jl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav: icon + label rows, soft rounded active pill */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {filter && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="flex items-center gap-1.5 text-[11.5px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors px-1"
          >
            ← {locale === "da" ? "Alle" : "All"}
          </button>
        )}
        {visibleGroups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`}>
            {group.label && (
              <div className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
                {group.label}
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
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px]",
                      isActive
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                    )}
                  >
                    <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                  </RouterNavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: user + account menu */}
      <div className="p-3 border-t border-sidebar-border shrink-0 bg-sidebar-background">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 px-2 py-1.5 w-full rounded-xl hover:bg-sidebar-accent transition-colors">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/15 text-primary text-[11px]">{initials}</AvatarFallback>
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
      className="hidden md:flex md:flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-sidebar-border/60"
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
          className="md:hidden grid place-items-center h-10 w-10 rounded-2xl bg-card border border-border/60 text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <RailContent onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
