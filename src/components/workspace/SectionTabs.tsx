import { useId } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { isLocale, useI18n } from '@/lib/i18n';
import { useMyBlockedModules } from '@/hooks/api/useModuleAccess';
import { SECTIONS, sectionFromPath } from '@/lib/sections';
import { cn } from '@/lib/utils';

const SLIDE: Transition = { type: 'spring', duration: 0.3, bounce: 0.15 };
const INSTANT: Transition = { duration: 0 };

/**
 * Department tabs in the top bar. The active tab is derived from the URL.
 * The active background and accent underline are shared-layout elements, so
 * they slide from the previous tab to the new one instead of jumping.
 */
export function SectionTabs({ className }: { className?: string }) {
  const { t } = useI18n();
  const params = useParams();
  const { pathname } = useLocation();
  const blocked = useMyBlockedModules();
  const reduceMotion = useReducedMotion();
  // ContextBar mounts this twice (top bar and the row below it, one hidden by
  // CSS); scoping the layoutIds keeps each indicator within its own tab row.
  const scope = useId();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const active = sectionFromPath(pathname);
  const visible = SECTIONS.filter(s => !s.module || !blocked.has(s.module));
  const transition = reduceMotion ? INSTANT : SLIDE;

  return (
    <nav aria-label={t('nav.sections')} className={cn('flex items-center gap-1', className)}>
      {visible.map(section => {
        const isActive = section.id === active;
        return (
          <Link
            key={section.id}
            to={`${base}/${section.dashboardPath}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-[13px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`${scope}-section-tab-bg`}
                transition={transition}
                className="absolute inset-0 rounded-md bg-foreground/[0.07]"
                aria-hidden="true"
              />
            )}
            <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: section.accent, opacity: isActive ? 1 : 0.55 }} aria-hidden="true" />
            <span className="relative">{t(section.labelKey)}</span>
            {isActive && (
              <motion.span
                layoutId={`${scope}-section-tab-underline`}
                transition={transition}
                initial={false}
                animate={{ backgroundColor: section.accent }}
                className="absolute inset-x-3 -bottom-[13px] hidden h-0.5 2xl:block rounded-full"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
