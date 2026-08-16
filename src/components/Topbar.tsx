import { useState, useRef, useEffect } from 'react';
import { Search, LogOut, Sun, Moon, User, Settings, Sparkles, Menu, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import LanguagePicker from '@/components/LanguagePicker';
import type { Tables } from '@/integrations/supabase/types';

type LeadSearchResult = Pick<Tables<'leads'>, 'id' | 'name' | 'company_name'>;
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
import { supabase } from '@/integrations/supabase/client';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Topbar() {
  const { t } = useI18n();
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (!theme && true);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LeadSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedSearch.trim()) { setSearchResults([]); return; }
    const fetchResults = async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, name, company_name')
        .or(`name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,company_name.ilike.%${debouncedSearch}%`)
        .limit(6);
      setSearchResults(data ?? []);
    };
    fetchResults();
  }, [debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setMobileSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return (email || '??').slice(0, 2).toUpperCase();
  };

  const handleResultClick = (id: string) => {
    navigate(`/${locale}/app/crm/leads`);
    setSearchOpen(false);
    setMobileSearchOpen(false);
    setSearchQuery('');
  };

  const searchResultsDropdown = (
    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
      {searchResults.length === 0 ? (
        <p className="text-sm text-muted-foreground p-3 text-center">{t('profile.noResults')}</p>
      ) : (
        searchResults.map(r => (
          <button
            key={r.id}
            className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm flex items-center gap-2"
            onClick={() => handleResultClick(r.id)}
          >
            <User className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{r.name}</span>
            {r.company_name && <span className="text-muted-foreground text-xs truncate">· {r.company_name}</span>}
          </button>
        ))
      )}
    </div>
  );

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

      {/* Desktop search — visible on sm+ */}
      <div ref={searchRef} className="relative hidden sm:flex items-center gap-2 w-full max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('common.search')}
          className="bg-card/60"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
        />
        {searchOpen && searchQuery.trim() && searchResultsDropdown}
      </div>

      {/* Spacer on mobile when search is closed */}
      <div className="flex-1 sm:hidden" />

      <div className="flex items-center gap-1 sm:gap-3">
        {/* Mobile search toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden rounded-full"
          onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
        >
          {mobileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>

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

      {/* Mobile search overlay — slides down below topbar */}
      {mobileSearchOpen && (
        <div
          ref={mobileSearchRef}
          className="absolute left-0 right-0 top-full z-50 bg-background border-b border-border p-3 sm:hidden"
        >
          <div className="relative flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              placeholder={t('common.search')}
              className="bg-card/60"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            />
          </div>
          {searchOpen && searchQuery.trim() && searchResultsDropdown}
        </div>
      )}
    </div>
  );
}
