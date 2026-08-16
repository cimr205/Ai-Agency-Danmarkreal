import { ReactNode } from 'react';
import Topbar from '@/components/Topbar';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({ basePath, children }: { basePath: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AdminSidebar basePath={basePath} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-4 border-b border-border/50 liquid-glass px-6 py-3">
          <Topbar />
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
