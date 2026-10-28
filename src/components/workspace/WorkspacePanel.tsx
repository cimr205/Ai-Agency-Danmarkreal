import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The large rounded gradient surface — the workspace design language's one
 * markedly different element per screen (calendar's main panel, Power
 * Dialer's main panel, …). Children render on top; the gradient only lives
 * on this wrapper so it never has to be re-measured per module.
 */
export function WorkspaceGradientSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn('flex min-w-0 flex-1 flex-col overflow-hidden rounded-[32px]', className)}
      style={{ background: 'var(--workspace-gradient)' }}
    >
      {children}
    </section>
  );
}

/**
 * The soft glass tray that holds the sidebar + gradient surface side by
 * side — a frosted emerald/terracotta wash rather than a flat black panel,
 * backdrop-blurred so anything that peeks through (tiles, rows) reads as
 * glass sitting in the tray, not a hard-edged box.
 */
export function WorkspaceFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex gap-[10px] rounded-[32px] border p-2 backdrop-blur-xl', className)}
      style={{ background: 'var(--workspace-frame)', borderColor: 'var(--workspace-frame-border)' }}
    >
      {children}
    </div>
  );
}

/**
 * The white base area under the gradient's top strip — thin dividers, no
 * boxed rows. Sets its own text color rather than inheriting `text-foreground`:
 * this surface is a fixed light palette regardless of the app's light/dark
 * theme (same as the gradient above it), so theme-reactive text utilities
 * would otherwise turn near-white in dark mode and vanish against it.
 */
export function WorkspaceSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto bg-workspace-surface text-workspace-ink', className)}>
      {children}
    </div>
  );
}

/** The emerald pill button — reserved for the single primary action per screen. */
export function WorkspacePillButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-workspace-accent px-5 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(22,129,90,0.55)] transition-[opacity,transform] hover:-translate-y-px disabled:translate-y-0 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
