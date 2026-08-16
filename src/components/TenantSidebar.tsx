import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Briefcase, Settings, UserSquare2, History, Bot, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: 'crm/leads', labelKey: 'nav.leads', icon: Users },
  { href: 'crm/deals', labelKey: 'nav.deals', icon: Briefcase },
  { href: 'crm/lead-generation', labelKey: 'nav.leadGeneration', icon: Sparkles },
  { href: 'pa', labelKey: 'nav.clowdbot', icon: Bot },
  { href: 'hr/employees', labelKey: 'nav.employees', icon: UserSquare2 },
  { href: 'history', labelKey: 'nav.history', icon: History },
  { href: 'settings/company', labelKey: 'nav.settings', icon: Settings },
];

export default function TenantSidebar({ basePath }: { basePath: string }) {
  const location = useLocation();
  const { t } = useI18n();
  const { user } = useAuth();
  const adminItems: typeof navItems = []; // TODO: check admin via user_roles table

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 border-r border-border bg-card/80 backdrop-blur">
      <div className="p-6 border-b border-border">
        <div className="text-lg font-semibold">{t('appName')}</div>
        <div className="text-xs text-muted-foreground mt-1">{t('nav.dashboard')}</div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {[...navItems, ...adminItems].map((item) => {
          const path = `${basePath}/${item.href}`;
          const isActive = location.pathname.startsWith(path);
          return (
            <Link
              key={item.href}
              to={path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
