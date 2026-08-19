import { ReactNode } from 'react';
import { AppSidebar, MobileSidebarTrigger } from './app/AppSidebar';
import Topbar from './Topbar';
import AiAgentWidget from './AiAgentWidget';
import { useSessionTracker } from '@/hooks/useSessionTracker';
import { GuidedTour } from './onboarding/GuidedTour';

export default function AppShell({ basePath, children }: { basePath: string; children: ReactNode }) {
  useSessionTracker();
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="liquid-glass flex items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3 shrink-0">
          <MobileSidebarTrigger />
          <Topbar />
        </header>
        <main className="flex-1 p-4 sm:p-6 pb-20 overflow-auto">
          {children}
        </main>
      </div>
      <AiAgentWidget />
      <GuidedTour />
    </div>
  );
}
