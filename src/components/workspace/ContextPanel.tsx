import { useState } from "react";
import { PanelRightClose, PanelRightOpen, ShieldCheck } from "lucide-react";
import { OperatingManagerPanel } from "./OperatingManagerPanel";

/**
 * Right-side context panel. Collapsible. Replaces the stacked AmbientAIBar +
 * AmbientInsightsRibbon + AmbientPresence rows that cluttered the top chrome.
 */
export function ContextPanel() {
  const [open, setOpen] = useState(true);

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
        <div className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[380px] xl:w-[420px] shrink-0 border-l border-border/60 bg-background/80 backdrop-blur-xl flex-col">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-foreground" />
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80">
            Operating Manager
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          aria-label="Collapse context panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <OperatingManagerPanel />
    </aside>
  );
}
