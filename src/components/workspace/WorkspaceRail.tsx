import { useState, useEffect, useMemo } from "react";
import { NavLink as RouterNavLink, useNavigate, useParams, useLocation } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type Icon,
  SquaresFour, Buildings, CalendarBlank, ListChecks, Tray, ChatCircle,
  Crosshair, Briefcase, Funnel, UserFocus,
  PhoneCall, PaperPlaneTilt, Megaphone, Microphone, Sparkle, FilmSlate,
  Receipt, FileText, CreditCard,
  UsersThree, Clock, CalendarCheck, CalendarDots, AirplaneTilt, Money, UserPlus, ChartBar, ChartPieSlice,
  TreeStructure, ChatCenteredDots, ShieldCheck, PlugsConnected, Brain, Lightning, Robot, LinkSimple, Lifebuoy, GearSix,
  Plus, List, CaretDown, SidebarSimple, User, SignOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useMyBlockedModules, type ModuleKey } from "@/hooks/api/useModuleAccess";

/* Reference-styled dark liquid-glass rail — floats over the app background,
   the same premium look regardless of the active app theme. Phosphor duotone
   icons, tinted per section. */
const PANEL = "border border-white/10 bg-[#15181f]/85 backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]";
const ACTIVE_GREEN = "#37D67A";

interface NavItem { label: string; path: string; icon: Icon; dataTour?: string; }
interface NavGroup { label: string | null; module: ModuleKey | null; accent: string; items: NavItem[]; }

function useNavGroups(): NavGroup[] {
  const { t } = useI18n();
  return [
    {
      label: t("nav.menu") || "Menu", module: null, accent: "#C7CDD6",
      items: [
        { label: t("nav.dashboard") || "Dashboard", path: "dashboard", icon: SquaresFour, dataTour: "dashboard" },
        { label: t("nav.clients"), path: "clients", icon: Buildings },
        { label: t("nav.calendar") || "Kalender", path: "work/calendar", icon: CalendarBlank },
        { label: t("nav.tasks") || "Opgaver", path: "work/tasks", icon: ListChecks },
        { label: t("nav.smartInbox") || "Indbakke", path: "email/emails", icon: Tray },
        { label: t("nav.messages") || "Beskeder", path: "work/inbox", icon: ChatCircle },
      ],
    },
    {
      label: t("nav.crm") || "CRM", module: "crm", accent: "#5B8DEF",
      items: [
        { label: t("nav.leads") || "Leads", path: "crm/leads", icon: Crosshair, dataTour: "leads" },
        { label: t("nav.deals") || "Deals", path: "crm/deals", icon: Briefcase, dataTour: "pipeline" },
        { label: t("nav.leadGeneration") || "Lead Gen", path: "crm/lead-generation", icon: Funnel },
        { label: t("nav.icp") || "ICP", path: "crm/icp", icon: UserFocus },
      ],
    },
    {
      label: t("nav.marketing") || "Marketing", module: "marketing", accent: "#A78BFA",
      items: [
        { label: t("nav.videoStudio") || "Video Studio", path: "marketing/video-studio", icon: FilmSlate },
        { label: t("nav.coldCaller") || "Power Dialer", path: "marketing/cold-caller", icon: PhoneCall },
        { label: t("nav.bulkEmail") || "Bulk email", path: "email/bulk", icon: PaperPlaneTilt },
        { label: t("nav.metaAds") || "Meta Ads", path: "marketing/meta-ads", icon: Megaphone },
        { label: t("nav.voiceAgent") || "Voice Agent", path: "marketing/voice-agent", icon: Microphone },
        { label: t("nav.aiMedia") || "AI Medier", path: "ai/media", icon: Sparkle },
      ],
    },
    {
      label: t("nav.finance") || "Finance", module: "finance", accent: "#34D399",
      items: [
        { label: t("nav.invoices") || "Fakturaer", path: "finance/invoices", icon: Receipt },
        { label: t("nav.quotes") || "Tilbud", path: "finance/quotes", icon: FileText },
        { label: t("nav.payments") || "Betalinger", path: "finance/payments", icon: CreditCard },
      ],
    },
    {
      label: t("nav.hr") || "HR", module: "hr", accent: "#F6B44D",
      items: [
        { label: t("nav.employees") || "Medarbejdere", path: "hr/employees", icon: UsersThree },
        { label: t("nav.timeTracking") || "Tidsregistrering", path: "hr/time-tracking", icon: Clock },
        { label: t("nav.attendance") || "Fremmøde", path: "hr/attendance", icon: CalendarCheck },
        { label: t("nav.workSchedule") || "Vagtplan", path: "hr/work-schedule", icon: CalendarDots },
        { label: t("nav.leave") || "Fravær", path: "hr/leave", icon: AirplaneTilt },
        { label: t("nav.payroll") || "Løn", path: "hr/payroll", icon: Money },
        { label: t("nav.recruitment") || "Rekruttering", path: "hr/recruitment", icon: UserPlus },
        { label: t("nav.workforceDashboard") || "Workforce", path: "hr/workforce", icon: ChartBar },
        { label: t("nav.workforceReports") || "Rapporter", path: "hr/reports", icon: ChartPieSlice },
      ],
    },
    {
      label: t("nav.controlRoom"), module: "system", accent: "#22D3EE",
      items: [
        { label: t("nav.studio"), path: "workspace/studio", icon: TreeStructure },
        { label: t("nav.workflowChat"), path: "workspace/workflow-chat", icon: ChatCenteredDots },
        { label: t("nav.operatingManager"), path: "workspace/operating-manager", icon: ShieldCheck },
        { label: t("nav.connectedApps"), path: "workspace/connected-apps", icon: PlugsConnected },
        { label: t("nav.insights"), path: "workspace/intelligence", icon: Brain },
        { label: t("nav.automation"), path: "autopilot", icon: Lightning },
        { label: t("nav.assistant"), path: "pa", icon: Robot, dataTour: "pa" },
        { label: t("nav.webhooks") || "Webhooks", path: "settings/webhooks", icon: LinkSimple },
        { label: t("nav.help"), path: "help", icon: Lifebuoy },
        { label: t("nav.settings") || "Indstillinger", path: "settings/company", icon: GearSix, dataTour: "settings" },
      ],
    },
  ];
}

interface Props { onOpenPalette: () => void; }

function RailItem({ item, base, collapsed, accent, onNavigate }: { item: NavItem; base: string; collapsed: boolean; accent: string; onNavigate?: () => void }) {
  const link = (
    <RouterNavLink
      to={`${base}/${item.path}`}
      onClick={onNavigate}
      data-tour={item.dataTour}
      end
      className={({ isActive }) => cn(
        "group relative flex items-center rounded-xl text-[13.5px] transition-colors",
        collapsed ? "h-11 w-11 justify-center" : "gap-3 px-3 py-2.5",
        isActive ? "bg-white/[0.08] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white",
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full" style={{ background: ACTIVE_GREEN }} aria-hidden="true" />}
          <item.icon size={20} weight="duotone" className={cn("shrink-0 transition-opacity", isActive ? "opacity-100" : "opacity-90 group-hover:opacity-100")} style={{ color: accent }} aria-hidden="true" />
          {!collapsed && <span className="truncate font-medium">{item.label}</span>}
        </>
      )}
    </RouterNavLink>
  );
  if (!collapsed) return <li>{link}</li>;
  return (
    <li>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </li>
  );
}

function RailContent({ onNavigate, collapsed, onToggleCollapse }: { onNavigate?: () => void; collapsed: boolean; onToggleCollapse?: () => void }) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, logout } = useAuth();
  const { t } = useI18n();
  const allGroups = useNavGroups();
  const blockedModules = useMyBlockedModules();
  const groups = allGroups.filter(g => !g.module || !blockedModules.has(g.module));

  const name = profile?.full_name || profile?.email || "";
  const initials = (name || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "dashboard.greetingMorning" : hour < 18 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening");

  const activeGroupLabel = useMemo(() => {
    for (const g of groups) {
      if (g.module && g.items.some(it => location.pathname.startsWith(`${base}/${it.path}`))) return g.label;
    }
    return null;
  }, [groups, location.pathname, base]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroupLabel ? [activeGroupLabel] : []));
  useEffect(() => {
    if (activeGroupLabel) setOpenGroups(prev => (prev.has(activeGroupLabel) ? prev : new Set(prev).add(activeGroupLabel)));
  }, [activeGroupLabel]);

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => { const next = new Set(prev); if (next.has(label)) next.delete(label); else next.add(label); return next; });

  const tools: { icon: Icon; label: string; path: string }[] = [
    { icon: GearSix, label: t("nav.settings") || "Indstillinger", path: "settings/company" },
    { icon: PlugsConnected, label: t("nav.connectedApps"), path: "workspace/connected-apps" },
    { icon: LinkSimple, label: t("nav.webhooks") || "Webhooks", path: "settings/webhooks" },
    { icon: Lifebuoy, label: t("nav.help"), path: "help" },
  ];

  return (
    <div className={cn("flex h-full w-full flex-col rounded-2xl text-white", PANEL, collapsed ? "p-2" : "p-3")}>
      {/* Profile */}
      <div className={cn("flex items-center gap-2.5", collapsed ? "flex-col" : "")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("flex min-w-0 items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-white/5", collapsed ? "justify-center" : "flex-1")} aria-label={t("nav.accountMenu")}>
              <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10"><AvatarImage src={profile?.avatar_url || undefined} /><AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white">{initials}</AvatarFallback></Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[10.5px] text-white/45">{greeting} 👋</p>
                  <p className="truncate text-[13.5px] font-semibold leading-tight text-white">{name}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={collapsed ? "right" : "bottom"} align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm">{name}</div>
              {profile?.full_name && <div className="truncate text-xs text-muted-foreground">{profile.email}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`${base}/settings/profile`)}><User className="mr-2" size={16} /> {t("nav.profile") || "Profil"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`${base}/settings/company`)}><GearSix className="mr-2" size={16} /> {t("nav.settings") || "Indstillinger"}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => { try { await logout(); } finally { navigate(`/${locale}/auth/login`, { replace: true }); } }} className="text-destructive focus:text-destructive"><SignOut className="mr-2" size={16} /> {t("common.signOut") || "Log ud"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="hidden shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white md:block" aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}>
            <SidebarSimple size={18} weight="duotone" />
          </button>
        )}
      </div>

      <div className="my-3 h-px bg-white/[0.07]" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden pr-0.5">
        {groups.map((group, gi) => {
          if (!group.module) {
            return (
              <div key={`group-${gi}`} className="pb-1">
                {!collapsed && <div className="px-3 pb-1 text-[11px] font-medium text-white/35">{group.label}: {group.items.length}</div>}
                <ul className="space-y-0.5">
                  {group.items.map(item => <RailItem key={item.path} item={item} base={base} collapsed={collapsed} accent={group.accent} onNavigate={onNavigate} />)}
                </ul>
              </div>
            );
          }
          const open = collapsed || openGroups.has(group.label as string);
          return (
            <div key={group.label} className="pt-1.5">
              {!collapsed && (
                <button type="button" onClick={() => toggleGroup(group.label as string)} aria-expanded={open}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-medium text-white/35 transition-colors hover:text-white/70">
                  <span>{group.label}: {group.items.length}</span>
                  <CaretDown size={13} weight="bold" className={cn("shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
                </button>
              )}
              {open && (
                <ul className="space-y-0.5">
                  {group.items.map(item => <RailItem key={item.path} item={item} base={base} collapsed={collapsed} accent={group.accent} onNavigate={onNavigate} />)}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Tools row */}
      {!collapsed && (
        <div className="mt-3">
          <div className="px-1 pb-1.5 text-[11px] font-medium text-white/35">{t("nav.tools")}: {tools.length}</div>
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.04] p-1.5">
            {tools.map(tool => (
              <Tooltip key={tool.path} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={() => { navigate(`${base}/${tool.path}`); onNavigate?.(); }} className="grid h-8 flex-1 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white" aria-label={tool.label}>
                    <tool.icon size={17} weight="duotone" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{tool.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Create CTA */}
      <button
        onClick={() => { navigate(`${base}/work/tasks?create=true`); onNavigate?.(); }}
        className={cn("mt-3 flex items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] transition-colors hover:bg-white/[0.07]", collapsed ? "h-12 w-12 mx-auto" : "flex-col gap-2 p-4")}
        aria-label={t("nav.createNew")}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#3B82F6] text-white shadow-[0_8px_24px_-6px_rgba(59,130,246,0.7)]"><Plus size={22} weight="bold" /></span>
        {!collapsed && <span className="text-[13px] font-medium text-white">{t("nav.createNew")}</span>}
      </button>
    </div>
  );
}

export function WorkspaceRail(_props: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar_collapsed_v1") === "1"; } catch { return false; }
  });
  const toggle = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem("sidebar_collapsed_v1", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });

  return (
    <aside
      className={cn("hidden shrink-0 p-3 md:block", collapsed ? "w-[88px]" : "w-[280px]")}
      aria-label={t("nav.workspaceNavigation")}
    >
      <div className="sticky top-3 h-[calc(100vh-1.5rem)]">
        <RailContent collapsed={collapsed} onToggleCollapse={toggle} />
      </div>
    </aside>
  );
}

export function WorkspaceRailMobileTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground hover:text-foreground md:hidden" aria-label={t("nav.openMenu")}>
          <List size={18} weight="bold" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] border-0 bg-transparent p-2">
        <SheetTitle className="sr-only">{t("nav.workspaceNavigation")}</SheetTitle>
        <div className="h-full">
          <RailContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
