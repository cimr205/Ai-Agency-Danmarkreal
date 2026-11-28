import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Users, Megaphone, FileText, Building2, Bot } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ScrollReveal } from './ScrollReveal';
import dashboardHome from '@/assets/landing/dashboard-home.jpg';
import dashboardCrm from '@/assets/landing/dashboard-crm.jpg';
import dashboardMarketing from '@/assets/landing/dashboard-marketing.jpg';
import dashboardFinance from '@/assets/landing/dashboard-finance.jpg';
import dashboardHr from '@/assets/landing/dashboard-hr.jpg';
import dashboardControlRoom from '@/assets/landing/dashboard-control-room.jpg';
import { MODULE_COLORS } from './moduleColors';

export function DashboardPreview() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);

  const tabs = [
    { icon: LayoutDashboard, labelKey: 'landing.previewHomeLabel', image: dashboardHome, color: MODULE_COLORS.dashboard },
    { icon: Users, labelKey: 'landing.featureCrm', image: dashboardCrm, color: MODULE_COLORS.crm },
    { icon: Building2, labelKey: 'landing.featureHr', image: dashboardHr, color: MODULE_COLORS.hr },
    { icon: FileText, labelKey: 'landing.featureInvoice', image: dashboardFinance, color: MODULE_COLORS.invoice },
    { icon: Megaphone, labelKey: 'landing.featureMarketing', image: dashboardMarketing, color: MODULE_COLORS.marketing },
    { icon: Bot, labelKey: 'landing.featureAi', image: dashboardControlRoom, color: MODULE_COLORS.ai },
  ];

  return (
    <section className="relative py-28 md:py-40 overflow-hidden" aria-label={t('landing.previewSectionLabel')}>
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        <div className="grid grid-cols-12 gap-x-6 mb-14 lg:mb-16">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                {t('landing.previewSectionLabel')}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.05] max-w-[680px]">
              {t('landing.previewHeadlinePre')}{' '}
              <span className="text-primary">{t('landing.previewHeadlineItalic')}</span>
              {t('landing.previewHeadlinePost')}
            </h2>
            <p className="mt-5 text-[14.5px] text-muted-foreground/90 leading-[1.6] max-w-[560px]">
              {t('landing.previewSubtitle')}
            </p>
          </div>
        </div>

        <ScrollReveal y={24} duration={0.7}>
          <div className="rounded-[16px] border border-foreground/[0.08] bg-card overflow-hidden shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_40px_90px_-30px_hsl(222_47%_11%/0.25)]">
            {/* Window chrome */}
            <div className="px-4 py-3 border-b border-foreground/[0.06] flex items-center justify-between bg-foreground/[0.015]">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="w-2 h-2 rounded-full bg-foreground/15" />
                <span className="w-2 h-2 rounded-full bg-foreground/15" />
                <span className="w-2 h-2 rounded-full bg-foreground/15" />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/50 tracking-wide">
                app.aiagencydanmark.dk/{active === 0 ? 'dashboard' : t(tabs[active].labelKey).toLowerCase()}
              </span>
              <span className="w-10" aria-hidden="true" />
            </div>

            {/* Tab rail — click to switch the real screenshot shown below */}
            <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto border-b border-foreground/[0.06] bg-foreground/[0.01]">
              {tabs.map((tab, i) => {
                const isActive = active === i;
                return (
                  <button
                    key={tab.labelKey}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-pressed={isActive}
                    className="relative flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium whitespace-nowrap rounded-t-[8px] transition-colors"
                    style={{ color: isActive ? tab.color : undefined }}
                  >
                    <tab.icon className={`w-3.5 h-3.5 ${isActive ? '' : 'text-muted-foreground/60'}`} strokeWidth={1.75} />
                    <span className={isActive ? '' : 'text-muted-foreground/70'}>{t(tab.labelKey)}</span>
                    {isActive && (
                      <motion.span
                        layoutId="dashboard-preview-tab-underline"
                        className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
                        style={{ backgroundColor: tab.color }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Screenshot area */}
            <div className="relative aspect-[16/9.5] bg-background">
              <AnimatePresence mode="wait">
                <motion.img
                  key={active}
                  src={tabs[active].image}
                  alt={t(tabs[active].labelKey)}
                  className="absolute inset-0 w-full h-full object-cover object-top"
                  loading={active === 0 ? 'eager' : 'lazy'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                />
              </AnimatePresence>
            </div>
          </div>

          <p className="mt-4 text-[12px] text-muted-foreground/60 font-mono">{t('landing.previewHint')}</p>
        </ScrollReveal>
      </div>
    </section>
  );
}
