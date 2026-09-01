import { useState } from "react";
import {
  LayoutDashboard, Users, Briefcase, FileText, CreditCard,
  Calendar, ClipboardList, Mail, Settings,
  TrendingUp, Clock, LogOut, Target,
  Megaphone, Bot, Send, Sparkles, Phone, Zap,
  UserCheck, CalendarDays, Wallet, UserPlus, Activity, BarChart3, CalendarClock,
  Webhook, BookOpen, Menu,
} from "lucide-react";
import logo from '@/assets/logo.png';
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { isLocale, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

function useNavData() {
  const { isAdmin, roles } = useAuth();
  const { t } = useI18n();

  const isManagerOrAbove = isAdmin || roles.some(r => r.role === 'manager');
  const isOwner = roles.some(r => r.role === 'owner' || r.role === 'company_admin' || r.role === 'system_admin');

  const overviewItems: NavItem[] = [
    { title: t('nav.dashboard'), url: "dashboard", icon: LayoutDashboard },
  ];

  const crmItems: NavItem[] = [
    { title: t('nav.leads'), url: "crm/leads", icon: Users },
    { title: t('nav.deals'), url: "crm/deals", icon: Briefcase },
    { title: t('nav.pipeline'), url: "crm/pipeline", icon: TrendingUp },
    { title: t('nav.leadGeneration'), url: "crm/lead-generation", icon: Sparkles },
    { title: t('nav.icp') || "ICP Finder", url: "crm/icp", icon: Target },
  ];

  const marketingItems: NavItem[] = [
    { title: t('nav.metaAds'), url: "marketing/meta-ads", icon: Megaphone },
    { title: t('nav.coldCaller'), url: "marketing/cold-caller", icon: Phone },
    { title: t('nav.voiceAgent') || 'Voice Agent', url: "marketing/voice-agent", icon: Bot },
    { title: t('nav.smartInbox'), url: "email/emails", icon: Sparkles },
    { title: t('nav.bulkEmail'), url: "email/bulk", icon: Send },
    { title: t('nav.emailTemplates'), url: "email/templates", icon: FileText },
  ];

  const financeItems: NavItem[] = [
    { title: t('nav.invoices'), url: "finance/invoices", icon: FileText },
    { title: t('nav.quotes'), url: "finance/quotes", icon: FileText },
    { title: t('nav.payments'), url: "finance/payments", icon: CreditCard },
  ];

  const hrEmployeeItems: NavItem[] = [
    { title: t('nav.timeTracking') || 'Time Tracking', url: "hr/time-tracking", icon: Clock },
    { title: t('nav.attendance') || 'Attendance', url: "hr/attendance", icon: Activity },
    { title: t('nav.workSchedule') || 'Work Schedule', url: "hr/work-schedule", icon: CalendarDays },
    { title: t('nav.leave') || 'Leave', url: "hr/leave", icon: CalendarClock },
  ];

  const hrAdminItems: NavItem[] = [
    { title: t('nav.employees') || 'Employees', url: "hr/employees", icon: UserCheck },
    { title: t('nav.workforceDashboard') || 'Workforce', url: "hr/workforce", icon: BarChart3 },
    { title: t('nav.payroll') || 'Payroll', url: "hr/payroll", icon: Wallet },
    { title: t('nav.recruitment') || 'Recruitment', url: "hr/recruitment", icon: UserPlus },
  ];

  const hrItems: NavItem[] = [
    ...hrEmployeeItems,
    ...(isOwner || isManagerOrAbove ? hrAdminItems : []),
  ];

  const productivityItems: NavItem[] = [
    { title: t('nav.tasks'), url: "work/tasks", icon: ClipboardList },
    { title: t('nav.calendar'), url: "work/calendar", icon: Calendar },
  ];

  const systemItems: NavItem[] = [
    { title: "Autopilot", url: "autopilot", icon: Zap },
    { title: t('nav.clowdbot'), url: "pa", icon: Bot },
    { title: 'Hjælpecenter', url: "help", icon: BookOpen },
    { title: t('nav.settings'), url: "settings/company", icon: Settings },
    ...(isOwner ? [{ title: t('nav.webhooks'), url: "settings/webhooks", icon: Webhook }] : []),
    ...(isAdmin ? [{ title: 'Monitoring', url: "monitoring", icon: Activity }] : []),
  ];

  return [
    { label: null, items: overviewItems },
    { label: t('nav.crm'), items: crmItems },
    { label: t('nav.marketing'), items: marketingItems },
    { label: t('nav.finance'), items: financeItems },
    { label: t('nav.hr') || 'HR', items: hrItems },
    { label: t('nav.productivity'), items: productivityItems },
    { label: t('nav.system'), items: systemItems },
  ];
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const { t } = useI18n();
  const groups = useNavData();

  const handleLogout = async () => {
    await logout();
    navigate(`/${locale}/auth/login`);
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header: logo + product name, always fully legible */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border shrink-0">
        <img src={logo} alt="AI Agency Danmark" className="h-8 w-8 rounded-md shrink-0" />
        <div className="min-w-0">
          <div className="font-display font-semibold text-sm text-sidebar-foreground leading-tight truncate">
            AI Agency Danmark
          </div>
          <div className="text-[11px] text-sidebar-foreground/50 leading-tight truncate">
            {t('appName') === 'AI Agency Danmark' ? (locale === 'da' ? 'Alt-i-ét workspace' : 'All-in-one workspace') : t('appName')}
          </div>
        </div>
      </div>

      {/* Nav: solid background, generous contrast, clearly separated groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {groups.map((group, i) => (
          group.items.length === 0 ? null : (
            <div key={group.label ?? `group-${i}`}>
              {group.label && (
                <div className="px-2 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map(item => (
                  <li key={item.url}>
                    <NavLink
                      to={`${base}/${item.url}`}
                      onClick={onNavigate}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13.5px] text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="!bg-primary/15 !text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        ))}
      </nav>

      {/* Footer: user + sign out, solid background so it never blends with page content */}
      <div className="p-3 border-t border-sidebar-border shrink-0 bg-sidebar">
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-display">
              {getInitials(profile?.full_name || null, profile?.email || '')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">
              {profile?.email}
            </p>
          </div>
          <Button
            variant="ghost" size="icon" onClick={handleLogout}
            className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground"
            aria-label={t('common.signOut')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MobileSidebarTrigger() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("lg:hidden shrink-0 text-muted-foreground hover:text-foreground")}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72">
        <SidebarBody onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-sidebar-border h-screen sticky top-0">
      <SidebarBody />
    </aside>
  );
}
