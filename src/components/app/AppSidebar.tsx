import {
  LayoutDashboard, Users, Briefcase, FileText, CreditCard,
  Calendar, ClipboardList, Mail, Settings,
  TrendingUp, Clock, LogOut, ChevronDown, Target,
  Megaphone, Bot, Shield, Send, Sparkles, Phone, Building2, Zap,
  UserCheck, CalendarDays, Wallet, UserPlus, Activity, BarChart3, CalendarClock,
  Webhook, BookOpen,
} from "lucide-react";
import logo from '@/assets/logo.png';
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { isLocale, useI18n } from "@/lib/i18n";

export function AppSidebar() {
  const { state } = useSidebar();
  const { profile, isSystemAdmin, isAdmin, roles, logout } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const collapsed = state === "collapsed";
  const { t } = useI18n();

  const isManagerOrAbove = isAdmin || roles.some(r => r.role === 'manager');
  const isOwner = roles.some(r => r.role === 'owner' || r.role === 'company_admin' || r.role === 'system_admin');

  const crmItems = [
    { title: t('nav.dashboard'), url: "dashboard", icon: LayoutDashboard },
    { title: t('nav.leads'), url: "crm/leads", icon: Users },
    { title: t('nav.deals'), url: "crm/deals", icon: Briefcase },
    { title: t('nav.pipeline'), url: "crm/pipeline", icon: TrendingUp },
    { title: t('nav.leadGeneration'), url: "crm/lead-generation", icon: Sparkles },
    { title: t('nav.icp') || "ICP Finder", url: "crm/icp", icon: Target },
  ];

  const marketingItems = [
    { title: t('nav.metaAds'), url: "marketing/meta-ads", icon: Megaphone },
    { title: t('nav.coldCaller'), url: "marketing/cold-caller", icon: Phone },
    { title: t('nav.voiceAgent') || 'Voice Agent', url: "marketing/voice-agent", icon: Bot },
  ];

  const emailItems = [
    { title: t('nav.smartInbox'), url: "email/emails", icon: Sparkles },
    { title: t('nav.bulkEmail'), url: "email/bulk", icon: Send },
    { title: t('nav.emailTemplates'), url: "email/templates", icon: FileText },
  ];

  const financeItems = [
    { title: t('nav.invoices'), url: "finance/invoices", icon: FileText },
    { title: t('nav.quotes'), url: "finance/quotes", icon: FileText },
    { title: t('nav.payments'), url: "finance/payments", icon: CreditCard },
  ];

  const hrEmployeeItems = [
    { title: t('nav.timeTracking') || 'Time Tracking', url: "hr/time-tracking", icon: Clock },
    { title: t('nav.attendance') || 'Attendance', url: "hr/attendance", icon: Activity },
    { title: t('nav.workSchedule') || 'Work Schedule', url: "hr/work-schedule", icon: CalendarDays },
    { title: t('nav.leave') || 'Leave', url: "hr/leave", icon: CalendarClock },
  ];

  const hrAdminItems = [
    { title: t('nav.employees') || 'Employees', url: "hr/employees", icon: UserCheck },
    { title: t('nav.workforceDashboard') || 'Workforce', url: "hr/workforce", icon: BarChart3 },
    { title: t('nav.payroll') || 'Payroll', url: "hr/payroll", icon: Wallet },
    { title: t('nav.recruitment') || 'Recruitment', url: "hr/recruitment", icon: UserPlus },
  ];

  const hrItems = [
    ...hrEmployeeItems,
    ...(isOwner || isManagerOrAbove ? hrAdminItems : []),
  ];

  const productivityItems = [
    { title: t('nav.tasks'), url: "work/tasks", icon: ClipboardList },
    { title: t('nav.calendar'), url: "work/calendar", icon: Calendar },
  ];

  const systemItems = [
    { title: "Autopilot", url: "autopilot", icon: Zap },
    { title: t('nav.clowdbot'), url: "pa", icon: Bot },
    { title: 'Hjælpecenter', url: "help", icon: BookOpen },
    { title: t('nav.settings'), url: "settings/company", icon: Settings },
    ...(isOwner ? [{ title: t('nav.webhooks'), url: "settings/webhooks", icon: Webhook }] : []),
    ...(isAdmin ? [{ title: 'Monitoring', url: "monitoring", icon: Activity }] : []),
  ];

  const handleLogout = async () => {
    await logout();
    navigate(`/${locale}/auth/login`);
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return email.slice(0, 2).toUpperCase();
  };

  const renderItems = (items: typeof crmItems) =>
    items.map((item) => {
      const tourId = item.url === 'dashboard' ? 'dashboard'
        : item.url === 'crm/leads' ? 'leads'
        : item.url === 'crm/pipeline' ? 'pipeline'
        : item.url === 'pa' ? 'pa'
        : item.url === 'settings/company' ? 'settings'
        : undefined;

      return (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton asChild>
            <NavLink
              to={`${base}/${item.url}`}
              className="sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-md"
              activeClassName="sidebar-nav-active font-medium"
              {...(tourId ? { 'data-tour': tourId } : {})}
            >
              <item.icon className="sidebar-nav-icon shrink-0" />
              {!collapsed && <span className="text-[13px]">{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  const renderGroup = (label: string, items: typeof crmItems) => (
    <SidebarGroup className="mb-0.5">
      <Collapsible defaultOpen className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-secondary/50 rounded-md px-3 py-1.5 mt-3">
            <span className="sidebar-section-label text-sidebar-foreground/50">{label}</span>
            {!collapsed && <ChevronDown className="h-3 w-3 text-sidebar-foreground/30 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(items)}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );

  return (
    <Sidebar className="border-r border-border" style={{ background: 'var(--bg-surface)' }}>
      <SidebarHeader className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <img src={logo} alt="AI Agency Danmark" className="h-7 w-auto" />
          {!collapsed && (
            <span className="font-display font-semibold text-sm text-foreground">AI Agency Danmark</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {renderGroup(t('nav.crm'), crmItems)}
        {renderGroup(t('nav.marketing'), marketingItems)}
        {renderGroup(t('nav.emailSection'), emailItems)}
        {renderGroup(t('nav.finance'), financeItems)}
        {renderGroup(t('nav.hr') || 'HR', hrItems)}
        {renderGroup(t('nav.productivity'), productivityItems)}
        {renderGroup(t('nav.system'), systemItems)}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-display">
              {getInitials(profile?.full_name || null, profile?.email || '')}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate font-display">
                {profile?.full_name || profile?.email}
              </p>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">
                {profile?.email}
              </p>
            </div>
          )}
          <Button
            variant="ghost" size="icon" onClick={handleLogout}
            className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground"
            aria-label={t('common.signOut')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
