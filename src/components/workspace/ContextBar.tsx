import { useLocation, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrency, type Currency } from "@/contexts/CurrencyContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WorkspaceRailMobileTrigger } from "./WorkspaceRail";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { SectionTabs } from "./SectionTabs";
import NotificationDropdown from "@/components/NotificationDropdown";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  DKK: "kr", EUR: "€", USD: "$", GBP: "£", SEK: "kr", NOK: "kr",
};

interface Props {
  onOpenPalette: () => void;
}

export function ContextBar({ onOpenPalette }: Props) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useI18n();
  const { currency, setCurrency, allCurrencies } = useCurrency();

  const today = new Date().toLocaleDateString(locale === "da" ? "da-DK" : locale === "de" ? "de-DE" : "en-US", {
    weekday: "short", day: "numeric", month: "short",
  });

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
    <header className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <WorkspaceRailMobileTrigger />
        <SectionTabs className="hidden 2xl:flex" />
      </div>

      <button
        onClick={onOpenPalette}
        aria-label={t('common.search')}
        className="flex h-10 w-full min-w-0 max-w-[260px] items-center gap-2.5 rounded-md border border-border/70 bg-card px-3 text-[13px] text-muted-foreground shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:text-foreground 2xl:w-10 2xl:shrink-0 2xl:justify-center 2xl:px-0 min-[1800px]:w-full min-[1800px]:shrink min-[1800px]:justify-start min-[1800px]:px-3"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate 2xl:hidden min-[1800px]:inline">{t('common.search')}</span>
      </button>

      <div className="hidden shrink-0 items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground 2xl:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-stamp" aria-hidden="true" />
        <span className="text-foreground/90">{today}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden h-10 items-center rounded-md border border-border/70 bg-card px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground sm:flex">
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

        <ThemeSwitcher />

        <button
          onClick={() => navigate(`${base}/settings/company`)}
          className="grid h-10 w-10 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          aria-label={t('nav.settings')}
        >
          <Settings className="h-4 w-4" />
        </button>

        <NotificationDropdown />

        <button
          onClick={() => navigate(`${base}/settings/profile`)}
          className="grid h-10 w-10 place-items-center overflow-hidden rounded-md border border-border/70"
          aria-label={t('nav.profile')}
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="text-[11px] bg-primary/20 text-primary rounded-none">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
    <div className="overflow-x-auto border-t border-border/40 px-4 py-1.5 2xl:hidden">
      <SectionTabs className="w-max" />
    </div>
    </div>
  );
}
