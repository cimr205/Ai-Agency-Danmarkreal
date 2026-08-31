import { cn } from '@/lib/utils';

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * The brand mark is intentionally geometric and product-led: two offset
 * frames create an open "A" without using robot, sparkle, or AI imagery.
 */
export function BrandMark({ className, title = 'Agency Danmark' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <rect x="1" y="1" width="30" height="30" rx="2" fill="currentColor" />
      <path
        d="M8 23.5 14.65 8h3.25l6.1 15.5h-4.15l-1.15-3.25h-6.2l-1.2 3.25H8Zm5.65-6.65h3.95l-1.9-5.35-2.05 5.35Z"
        fill="hsl(var(--background))"
      />
      <path d="M23.75 7.75v5.5" stroke="hsl(var(--primary))" strokeWidth="2.5" />
    </svg>
  );
}

export function BrandWordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark className="h-7 w-7 text-foreground" />
      <span className="min-w-0 leading-none">
        <span className="block truncate text-[13px] font-semibold uppercase tracking-[0.13em] text-foreground">
          Agency Danmark
        </span>
        {!compact ? (
          <span className="mt-1 block truncate font-mono text-[8px] uppercase tracking-[0.24em] text-muted-foreground">
            Business systems
          </span>
        ) : null}
      </span>
    </span>
  );
}
