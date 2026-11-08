import { useTheme } from "next-themes";
import { Palette, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/contexts/TenantContext";
import { THEME_MODES, type ThemeMode } from "@/lib/tenant";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { tx } from '@/lib/inlineI18n';

/** The three installed themes, with the swatch that identifies each. */
const THEME_META: Record<ThemeMode, { label: string; hint: string; swatch: string }> = {
  midnight: { label: "Midnight", get hint() { return tx("Mørk · indigo", "Dark · indigo"); }, swatch: "#6E8BFF" },
  daylight: { label: "Daylight", get hint() { return tx("Lys · blå", "Light · blue"); }, swatch: "#2D54F0" },
  graphite: { label: "Graphite", get hint() { return tx("Koksgrå · guld", "Charcoal · gold"); }, swatch: "#E6B450" },
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { setUserThemeOverride } = useTenant();
  const { t } = useI18n();

  const current = (THEME_MODES.includes(theme as ThemeMode) ? theme : "midnight") as ThemeMode;

  const pick = (next: ThemeMode) => {
    setTheme(next);              // immediate, tenant-independent
    setUserThemeOverride(next);  // persists through the tenant theme system
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid h-10 w-10 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          aria-label={t("common.theme")}
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("common.theme")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_MODES.map((mode) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => pick(mode)}
            className={cn("gap-2.5", mode === current && "bg-accent")}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/50"
              style={{ background: THEME_META[mode].swatch }}
              aria-hidden="true"
            />
            <span className="flex flex-col leading-tight">
              <span className={cn("text-sm", mode === current && "font-medium")}>{THEME_META[mode].label}</span>
              <span className="text-[11px] text-muted-foreground">{THEME_META[mode].hint}</span>
            </span>
            {mode === current && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
