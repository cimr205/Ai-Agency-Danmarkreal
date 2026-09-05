import { useLocation, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrency, type Currency } from "@/contexts/CurrencyContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WorkspaceRailMobileTrigger } from "./WorkspaceRail";
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/95 px-5 backdrop-blur sm:px-8">
      <div className="flex items-center gap-2 w-full max-w-[320px]">
        <WorkspaceRailMobileTrigger />
        <button
          onClick={onOpenPalette}
          className="flex h-10 w-full items-center gap-2.5 rounded-md border border-border/70 bg-card px-3 text-[13px] text-muted-foreground shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:text-foreground"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('common.search')}</span>
        </button>
      </div>

      <div className="hidden shrink-0 items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground md:flex">
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

        <button
          onClick={() => navigate(`${base}/settings/company`)}
          className="grid h-10 w-10 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <NotificationDropdown />

        <button
          onClick={() => navigate(`${base}/settings/profile`)}
          className="grid h-10 w-10 place-items-center overflow-hidden rounded-md border border-border/70"
          aria-label="Profile"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="text-[11px] bg-primary/20 text-primary rounded-none">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
}
