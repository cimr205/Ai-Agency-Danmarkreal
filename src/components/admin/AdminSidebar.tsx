import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Building2, Users, Settings, MessageSquare } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const navItems = [
  { href: 'admin/overview', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'admin/companies', label: 'Virksomheder', icon: Building2 },
  { href: 'admin/users', label: 'Brugere', icon: Users },
  { href: 'admin/contacts', label: 'Henvendelser', icon: MessageSquare },
  { href: 'admin/settings', label: 'Indstillinger', icon: Settings },
];

export default function AdminSidebar({ basePath }: { basePath: string }) {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 border-r border-border/50 bg-sidebar text-sidebar-foreground">
      <div className="p-5 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">Admin Panel</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const path = `${basePath}/${item.href}`;
            const isActive = location.pathname.includes(item.href);
            return (
              <Link
                key={item.href}
                to={path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
