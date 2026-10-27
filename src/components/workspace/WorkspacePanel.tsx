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

/** The dark frame that holds the sidebar + gradient surface side by side. */
export function WorkspaceFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-[10px] rounded-[32px] bg-workspace-frame p-2', className)}>
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

/** A black pill button — reserved for the single primary action per screen. */
export function WorkspacePillButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-workspace-ink px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
