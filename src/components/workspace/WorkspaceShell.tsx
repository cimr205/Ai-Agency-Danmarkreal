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
      <WorkspaceRail onOpenPalette={() => setPaletteOpen(true)} />

      <div className="relative flex h-screen min-w-0 flex-1 flex-col">
        <ContextBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.45)_100%)]">
          <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto w-full">
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
