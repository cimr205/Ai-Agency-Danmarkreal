import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useAmbientInsights } from "@/hooks/useAmbientInsights";
import { AlertTriangle, ArrowUpRight, Lightbulb, PanelRightClose, PanelRightOpen, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AmbientAIBar } from "./AmbientAIBar";
import { useI18n } from "@/lib/i18n";

const ICON = { risk: AlertTriangle, opportunity: ArrowUpRight, suggestion: Lightbulb, info: ShieldCheck };
const TONE = {
  risk: "text-destructive",
  opportunity: "text-emerald-400",
  suggestion: "text-amber-300",
  info: "text-muted-foreground/70",
};

/**
 * Right-side context panel. Collapsible. Replaces the stacked AmbientAIBar +
 * AmbientInsightsRibbon + AmbientPresence rows that cluttered the top chrome.
 */
export function ContextPanel() {
  const [open, setOpen] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(min-width: 1536px)").matches
    && window.localStorage.getItem("workspace-context-panel") !== "closed"
  ));
  const { data: insights } = useAmbientInsights();
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";

  const meaningful = (insights || []).filter(i => i.kind !== "info").slice(0, 8);

  if (!open) {
    return (
      <aside className="hidden h-screen w-10 shrink-0 flex-col items-center gap-2 border-l border-border/60 bg-background/70 py-3 backdrop-blur lg:flex">
        <button
          onClick={() => { setOpen(true); window.localStorage.setItem("workspace-context-panel", "open"); }}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("contextPanel.open")}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {meaningful.length > 0 && (
          <div className="grid place-items-center h-8 w-8 rounded-md text-muted-foreground">
            <div className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-stamp" />
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden h-screen w-72 shrink-0 flex-col border-l border-border/70 bg-card/85 backdrop-blur-xl lg:flex">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-stamp text-stamp-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Kontrolcenter
          </span>
        </div>
        <button
          onClick={() => { setOpen(false); window.localStorage.setItem("workspace-context-panel", "closed"); }}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("contextPanel.close")}
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {t("contextPanel.actions")}
          </h3>
          <AmbientAIBar />
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {t("contextPanel.signals")}
          </h3>
          {meaningful.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              {t("contextPanel.noSignals")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {meaningful.map((insight, i) => {
                const Icon = ICON[insight.kind];
                return (
                  <li key={i}>
                    <button
                      onClick={() => insight.href && navigate(`/${locale}/app/${insight.href}`)}
                      disabled={!insight.href}
                      className={cn(
                        "w-full text-left flex items-start gap-2 p-2 rounded-md border border-border/60 bg-background",
                        "text-[12px] text-muted-foreground/90 leading-snug",
                        insight.href && "hover:bg-foreground/5 hover:text-foreground cursor-pointer",
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", TONE[insight.kind])} />
                      <span className="flex-1">{insight.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
