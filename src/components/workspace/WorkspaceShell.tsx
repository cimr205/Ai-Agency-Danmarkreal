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
    <div className="premium-shell relative flex h-screen w-full overflow-hidden bg-background text-foreground">
      <WorkspaceRail onOpenPalette={() => setPaletteOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        <ContextBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
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
