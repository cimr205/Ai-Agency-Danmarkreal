import { Link, useLocation, useParams } from 'react-router-dom';
import { isLocale, useI18n } from '@/lib/i18n';
import { useMyBlockedModules } from '@/hooks/api/useModuleAccess';
import { SECTIONS, sectionFromPath } from '@/lib/sections';
import { cn } from '@/lib/utils';

/** Department tabs in the top bar. The active tab is derived from the URL. */
export function SectionTabs({ className }: { className?: string }) {
  const { t } = useI18n();
  const params = useParams();
  const { pathname } = useLocation();
  const blocked = useMyBlockedModules();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;
  const active = sectionFromPath(pathname);
  const visible = SECTIONS.filter(s => !s.module || !blocked.has(s.module));

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
              isActive ? 'bg-foreground/[0.07] text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: section.accent, opacity: isActive ? 1 : 0.55 }} aria-hidden="true" />
            {t(section.labelKey)}
            {isActive && <span className="absolute inset-x-3 -bottom-[13px] hidden h-0.5 2xl:block rounded-full" style={{ background: section.accent }} aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}
