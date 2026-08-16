import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Command, User, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { MODES, DESTINATIONS, PINNED, detectModeFromPath, type ModeId } from "./modes";

interface Props {
  onOpenPalette: () => void;
}

export function WorkspaceRail({ onOpenPalette }: Props) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { t } = useI18n();

  const detected = detectModeFromPath(pathname);
  const [activeMode, setActiveMode] = useState<ModeId>(detected);
  // re-sync if route changes mode externally
  useMemo(() => setActiveMode(detected), [detected]);

  const visibleDestinations = DESTINATIONS.filter(d => d.modes.includes(activeMode));

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  const RailItem = ({
    icon: Icon, label, active, onClick, to, danger, variant = "destination",
  }: {
    icon: LucideIcon; label: string; active?: boolean; onClick?: () => void; to?: string; danger?: boolean;
    variant?: "mode" | "destination" | "utility";
  }) => {
    const Wrapper = (to ? Link : "button") as React.ElementType;
    return (
      <Tooltip delayDuration={120}>
        <TooltipTrigger asChild>
          <Wrapper
            to={to}
            onClick={onClick}
            className={cn(
              "group relative grid place-items-center h-10 w-10 rounded-2xl transition-all duration-150 outline-none active:scale-[0.92]",
              "text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/[0.06]",
              active && variant === "mode" &&
                "bg-primary text-primary-foreground shadow-[0_2px_16px_-2px_hsl(var(--primary)/0.55)] hover:bg-primary",
              active && variant !== "mode" &&
                "bg-white text-black shadow-[0_2px_12px_rgba(255,255,255,0.15)] hover:bg-white",
              danger && "hover:text-destructive",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
          </Wrapper>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const isActiveDest = (path: string) => pathname.startsWith(`${base}/${path}`);

  return (
    <aside
      className="hidden md:flex h-screen sticky top-0 flex-col items-center w-[72px] shrink-0 border-r border-sidebar-border/60 bg-sidebar-background py-4 gap-1.5"
      aria-label="Workspace navigation"
    >
      {/* Brand */}
      <Link
        to={base + "/dashboard"}
        className="group grid place-items-center h-10 w-10 rounded-2xl mb-3 bg-gradient-to-br from-primary to-[hsl(258_90%_66%)] shadow-[0_2px_14px_-2px_hsl(var(--primary)/0.5)] transition-transform duration-150 active:scale-[0.92]"
      >
        <img src={logo} alt="" className="h-5 w-5 object-contain brightness-0 invert opacity-90 group-hover:opacity-100" />
      </Link>

      {/* Modes */}
      <div className="flex flex-col gap-1">
        {MODES.map(m => (
          <RailItem
            key={m.id}
            icon={m.icon}
            label={m.label}
            variant="mode"
            active={activeMode === m.id}
            onClick={() => setActiveMode(m.id)}
          />
        ))}
      </div>

      <div className="h-px w-6 bg-sidebar-border/70 my-2.5" />

      {/* Mode destinations */}
      <div className="flex flex-col gap-1 overflow-y-auto scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleDestinations.map(d => (
          <RailItem
            key={d.path}
            icon={d.icon}
            label={d.label}
            to={`${base}/${d.path}`}
            active={isActiveDest(d.path)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command palette hint */}
      <RailItem icon={Command} label="Søg & naviger (⌘K)" variant="utility" onClick={onOpenPalette} />

      <div className="h-px w-6 bg-sidebar-border/70 my-1.5" />

      {PINNED.map(d => (
        <RailItem
          key={d.path}
          icon={d.icon}
          label={d.label}
          to={`${base}/${d.path}`}
          active={isActiveDest(d.path)}
        />
      ))}

      {/* Account menu — avatar opens a dropdown with profile + logout so
          a stray click cannot accidentally sign the user out. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="grid place-items-center h-10 w-10 rounded-2xl hover:bg-white/[0.06] mt-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label={t("common.account") || "Konto"}
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-[10px] bg-foreground/10 text-foreground">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm">{profile?.full_name || profile?.email}</div>
            {profile?.full_name && (
              <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(`${base}/settings/profile`)}>
            <User className="h-4 w-4 mr-2" /> {t("nav.profile") || "Profil"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`${base}/settings/company`)}>
            <Settings className="h-4 w-4 mr-2" /> {t("nav.settings") || "Indstillinger"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                await logout();
              } finally {
                navigate(`/${locale}/auth/login`, { replace: true });
              }
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" /> {t("common.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
