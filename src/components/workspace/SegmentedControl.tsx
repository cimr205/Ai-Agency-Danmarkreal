import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * The pill-group control from the calendar's Month/week/Day switcher
 * (src/components/calendar/ViewSwitcher.tsx), generalised to any set of
 * options so Power Dialer's Queue/History/Setup switcher can share it.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="tablist"
      className="flex rounded-full border p-1 backdrop-blur-md"
      style={{ background: 'rgba(17,35,26,0.05)', borderColor: 'var(--workspace-glass-border)' }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative px-6 py-2 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === option.value ? 'text-workspace-accent' : 'text-workspace-ink/55',
          )}
        >
          {value === option.value && (
            <motion.span
              layoutId={layoutId}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
              className="absolute inset-0 bg-white shadow-[0_2px_10px_-2px_rgba(16,35,26,0.18)]"
              style={{ borderRadius: 999 }}
            />
          )}
          <span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
