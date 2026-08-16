import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { SystemStatusBanner } from "./SystemStatusBanner";
import { Breadcrumbs } from "./Breadcrumbs";
import { ROLE_LABELS } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrency, type Currency } from "@/contexts/CurrencyContext";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  DKK: 'kr', EUR: '€', USD: '$', GBP: '£', SEK: 'kr', NOK: 'kr',
};

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { roles, isAdmin } = useAuth();
  const { t } = useI18n();
  const { currency, setCurrency, allCurrencies } = useCurrency();

  const getRoleBadge = () => {
    const userRole = roles[0]?.role as AppRole;
    if (userRole === 'system_admin' || userRole === 'company_admin') {
      return { label: ROLE_LABELS[userRole] || 'Admin', variant: "destructive" as const };
    }
    if (userRole === 'manager') return { label: t('roles.manager'), variant: "default" as const };
    return { label: t('roles.employee'), variant: "secondary" as const };
  };

  const roleBadge = getRoleBadge();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <SystemStatusBanner />
          <header className="h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 relative bg-card/50">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs">
                    <Coins className="h-3.5 w-3.5" />
                    {currency}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {allCurrencies.map(c => (
                    <DropdownMenuItem key={c} onClick={() => setCurrency(c)} className={c === currency ? 'bg-accent font-semibold' : ''}>
                      <span className="w-5 text-center mr-2">{CURRENCY_SYMBOLS[c]}</span>
                      {c}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6 pb-16 overflow-auto page-enter">
            <Breadcrumbs />
            {children}
          </main>
          <footer className="h-10 border-t border-border flex items-center justify-center gap-4 px-4 shrink-0 text-[10px] text-muted-foreground/50 font-mono">
            <a href="/privacy" target="_blank" rel="noopener" className="hover:text-muted-foreground transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" target="_blank" rel="noopener" className="hover:text-muted-foreground transition-colors">Terms of Service</a>
            <span>·</span>
            <span>© {new Date().getFullYear()} AI Agency Danmark</span>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
