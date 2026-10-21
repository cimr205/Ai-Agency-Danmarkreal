import { ReactNode, useState } from "react";
import { WorkspaceRail } from "./WorkspaceRail";
import { ContextBar } from "./ContextBar";
import { ContextPanel } from "./ContextPanel";
import { CommandPaletteV2 } from "./CommandPaletteV2";
import { GuidedTour } from "@/components/onboarding/GuidedTour";
import { useSessionTracker } from "@/hooks/useSessionTracker";

export default function WorkspaceShell({ children }: { basePath?: string; children: ReactNode }) {
  useSessionTracker();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Soft ambient so the floating glass rail reads premium on any theme. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[140px]" />
        <div className="absolute bottom-0 left-40 h-[420px] w-[460px] rounded-full bg-stamp/10 blur-[150px]" />
      </div>
      <WorkspaceRail onOpenPalette={() => setPaletteOpen(true)} />

      <div className="relative flex h-screen min-w-0 flex-1 flex-col">
        <ContextBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.45)_100%)]">
          <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1920px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      <ContextPanel />

      <CommandPaletteV2 open={paletteOpen} onOpenChange={setPaletteOpen} />
      <GuidedTour />
    </div>
  );
}
