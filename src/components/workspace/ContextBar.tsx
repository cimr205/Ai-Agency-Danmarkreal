import { useLocation, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { Search, Settings, Sun, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrency, type Currency } from "@/contexts/CurrencyContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WorkspaceRailMobileTrigger } from "./WorkspaceRail";
import NotificationDropdown from "@/components/NotificationDropdown";
import { useTheme } from "next-themes";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  DKK: "kr", EUR: "€", USD: "$", GBP: "£", SEK: "kr", NOK: "kr",
};

interface Props {
  onOpenPalette: () => void;
}

export function ContextBar({ onOpenPalette }: Props) {
  const location = useLocation();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useI18n();
  const { currency, setCurrency, allCurrencies } = useCurrency();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const today = new Date().toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", {
    weekday: "short", day: "numeric", month: "short",
  });

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const area = location.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2, -1)[0]
    ?.replace(/-/g, " ") ?? "workspace";

  return (
    <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex w-full max-w-[460px] items-center gap-3">
        <WorkspaceRailMobileTrigger />
        <span className="hidden border-r border-border pr-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground lg:inline">
          {area}
        </span>
        <button
          onClick={onOpenPalette}
          className="flex h-9 w-full items-center gap-2.5 border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('common.search')}</span>
          <kbd className="ml-auto hidden border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">⌘ K</kbd>
        </button>
      </div>

      <div className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground xl:block">
        {locale === "da" ? "I dag" : locale === "de" ? "Heute" : "Today"} / <span className="text-foreground/85">{today}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden h-9 items-center border border-border bg-card px-3 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground sm:flex">
              {currency}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allCurrencies.map(c => (
              <DropdownMenuItem key={c} onClick={() => setCurrency(c)} className={c === currency ? "bg-accent font-medium" : ""}>
                <span className="w-5 text-center mr-2">{CURRENCY_SYMBOLS[c]}</span>{c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="grid h-9 w-9 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          aria-label={isDark ? t('common.switchToLight') : t('common.switchToDark')}
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={() => navigate(`${base}/settings/company`)}
          className="grid h-9 w-9 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <NotificationDropdown />

        <button
          onClick={() => navigate(`${base}/settings/profile`)}
          className="grid h-9 w-9 place-items-center overflow-hidden border border-border"
          aria-label="Profile"
        >
          <Avatar className="h-9 w-9 rounded-none">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="rounded-none bg-primary text-[10px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
}
