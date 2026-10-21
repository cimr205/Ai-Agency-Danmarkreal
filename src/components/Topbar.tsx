import { Search, LogOut, Sun, Moon, User, Settings, Sparkles, Menu } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import LanguagePicker from '@/components/LanguagePicker';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import NotificationDropdown from '@/components/NotificationDropdown';
import { useTheme } from 'next-themes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AppSidebar } from '@/components/app/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreateMenu } from '@/components/dashboard/CreateMenu';
import { openCommandPalette } from '@/components/CommandPalette';

export default function Topbar() {
  const { t } = useI18n();
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (!theme && true);

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return (email || '??').slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 flex-1">
      {/* Mobile hamburger */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </SheetContent>
      </Sheet>

      {/* Global search / command palette trigger */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="flex items-center gap-2 w-full max-w-md rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline truncate">{t('command.placeholder')}</span>
        <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <CreateMenu base={base} />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="rounded-full"
          title={isDark ? t('common.switchToLight') : t('common.switchToDark')}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <span className="hidden sm:inline-flex">
          <LanguagePicker />
        </span>
        <NotificationDropdown />

        {/* User profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border bg-card/60 p-1 pr-1 sm:pr-3 hover:bg-muted/50 transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(profile?.full_name, profile?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline truncate max-w-[120px]">
                {profile?.full_name || profile?.email?.split('@')[0]}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{profile?.full_name || profile?.email?.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground font-normal">{profile?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/${locale}/app/settings/profile`)}>
              <User className="h-4 w-4 mr-2" /> {t('profile.title')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/${locale}/app/settings/company`)}>
              <Settings className="h-4 w-4 mr-2" /> {t('settings.companyTitle')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/${locale}/app/onboarding`)}>
              <Sparkles className="h-4 w-4 mr-2" /> {t('profile.setupWizard')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={async () => { await logout(); navigate(`/${locale}/auth/login`); }}>
              <LogOut className="h-4 w-4 mr-2" /> {t('common.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
