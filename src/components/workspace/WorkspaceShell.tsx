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
    <div className="h-screen flex w-full bg-background text-foreground relative overflow-hidden">
      <WorkspaceRail onOpenPalette={() => setPaletteOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        <ContextBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 min-h-0 overflow-y-auto">
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
