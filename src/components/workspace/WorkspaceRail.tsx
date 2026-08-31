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
    const next = filter === label ? null : label;
    setFilter(next);
    if (!next) return;

    const targetGroup = groups.find(g => g.label === next);
    const firstItem = targetGroup?.items[0];
    if (firstItem) {
      navigate(`${base}/${firstItem.path}`);
      onNavigate?.();
    }
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
      <div className="flex h-[68px] shrink-0 items-center border-b border-sidebar-border px-4">
        <BrandWordmark />
      </div>

      {/* Domain switcher: a compact index, not another row of decorative pills. */}
      <div className="shrink-0 border-b border-sidebar-border px-4 py-3">
        <div className="grid grid-cols-4 gap-0">
          {jumpLabels.map((jl) => (
            <button
              key={jl.key}
              type="button"
              onClick={() => toggleFilter(jl.label)}
              className={cn(
                "border-b px-1 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                filter === jl.label
                  ? "border-primary text-sidebar-foreground"
                  : "border-transparent text-sidebar-foreground/40 hover:border-sidebar-border hover:text-sidebar-foreground",
              )}
            >
              {jl.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {filter && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground"
          >
            ← {locale === "da" ? "Alle" : "All"}
          </button>
        )}
        {visibleGroups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`}>
            {group.label && (
              <div className="mb-2 px-3 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/35">
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
                      "relative flex items-center gap-3 border border-transparent px-3 py-2 text-[13px] transition-colors",
                      isActive
                        ? "border-sidebar-border bg-sidebar-accent text-sidebar-foreground font-medium before:absolute before:-left-px before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:bg-primary"
                        : "text-sidebar-foreground/58 hover:border-sidebar-border/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
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
      className="sticky top-0 hidden h-screen w-[244px] shrink-0 border-r border-sidebar-border md:flex md:flex-col"
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
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <RailContent onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
