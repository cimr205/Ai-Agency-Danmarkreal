import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useAmbientInsights } from "@/hooks/useAmbientInsights";
import { AlertTriangle, ArrowUpRight, Lightbulb, Sparkles, PanelRightClose, PanelRightOpen, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { AmbientAIBar } from "./AmbientAIBar";

const ICON = { risk: AlertTriangle, opportunity: ArrowUpRight, suggestion: Lightbulb, info: Sparkles };
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
  const [open, setOpen] = useState(true);
  const { data: insights } = useAmbientInsights();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";

  const meaningful = (insights || []).filter(i => i.kind !== "info").slice(0, 8);

  if (!open) {
    return (
      <aside className="hidden lg:flex sticky top-0 h-screen w-10 shrink-0 border-l border-border/60 bg-background/40 backdrop-blur-sm flex-col items-center py-3 gap-2">
        <button
          onClick={() => setOpen(true)}
          className="grid place-items-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          aria-label="Open context panel"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {meaningful.length > 0 && (
          <div className="grid place-items-center h-8 w-8 rounded-md text-muted-foreground">
            <div className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-72 shrink-0 border-l border-border/60 bg-background/40 backdrop-blur-sm flex-col">
      <div className="h-11 px-3 flex items-center justify-between border-b border-border/40 shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70">
          Kontekst
        </span>
        <button
          onClick={() => setOpen(false)}
          className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          aria-label="Collapse context panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* AI quick trigger */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
            AI handlinger
          </h3>
          <AmbientAIBar />
        </section>

        {/* Insights */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
            Signaler
          </h3>
          {meaningful.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Ingen kritiske signaler lige nu.
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
                        "w-full text-left flex items-start gap-2 p-2 rounded-md border border-border/30",
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
