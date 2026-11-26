import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Inbox, UserCheck, TrendingUp, FileText, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ScrollReveal } from './ScrollReveal';
import { useScrollVelocity } from './useScrollVelocity';

const STEPS = [
  { icon: Inbox, labelKey: 'landing.connectedStep1Label', titleKey: 'landing.connectedStep1Title', bodyKey: 'landing.connectedStep1Body', tagKey: 'landing.connectedStep1Tag' },
  { icon: UserCheck, labelKey: 'landing.connectedStep2Label', titleKey: 'landing.connectedStep2Title', bodyKey: 'landing.connectedStep2Body', tagKey: 'landing.connectedStep2Tag' },
  { icon: TrendingUp, labelKey: 'landing.connectedStep3Label', titleKey: 'landing.connectedStep3Title', bodyKey: 'landing.connectedStep3Body', tagKey: 'landing.connectedStep3Tag' },
  { icon: FileText, labelKey: 'landing.connectedStep4Label', titleKey: 'landing.connectedStep4Title', bodyKey: 'landing.connectedStep4Body', tagKey: 'landing.connectedStep4Tag' },
] as const;

export function ConnectedBusiness() {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const scrollSpeed = useScrollVelocity();

  return (
    <section className="relative py-28 md:py-40 overflow-hidden" aria-label="Connected business flow">
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Section marker */}
        <div className="grid grid-cols-12 gap-x-6 mb-16 lg:mb-20">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                {t('landing.sectionConnectedLabel')}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.05] max-w-[760px]">
              {t('landing.connectedHeadlinePre')}{' '}
              <span className="text-primary">{t('landing.connectedHeadlineItalic')}</span>
              {t('landing.connectedHeadlinePost')}
            </h2>
            <p className="mt-5 text-[14.5px] text-muted-foreground/90 leading-[1.6] max-w-[620px]">
              {t('landing.connectedSubtitle')}
            </p>
          </div>
        </div>

        {/* Flow — desktop: horizontal line with 4 nodes. Mobile: stacked. */}
        <div className="relative">
          {/* connecting line (decorative, hidden from a11y tree) — draws in left to right */}
          <motion.div
            aria-hidden
            className="hidden lg:block absolute top-[27px] left-[12.5%] right-[12.5%] h-px bg-foreground/[0.12] origin-left"
            initial={reduceMotion ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-6">
            {STEPS.map((step, i) => {
              const isActive = active === i;
              return (
                <ScrollReveal key={step.labelKey} delay={i * 0.1} speedRef={scrollSpeed}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative text-left group focus:outline-none"
                  aria-describedby={`connected-step-${i}-body`}
                >
                  {/* node dot, aligned with the connecting line */}
                  <div className="hidden lg:flex items-center justify-center mb-5 relative z-10">
                    <span
                      className={`flex items-center justify-center w-[22px] h-[22px] rounded-full border transition-colors duration-200 motion-reduce:transition-none
                        ${isActive ? 'bg-primary border-primary' : 'bg-background border-foreground/20'}`}
                    >
                      <span className={`w-[7px] h-[7px] rounded-full ${isActive ? 'bg-primary-foreground' : 'bg-foreground/30'}`} />
                    </span>
                  </div>

                  <div
                    className={`rounded-[14px] border p-6 transition-all duration-200 motion-reduce:transition-none
                      ${isActive ? 'border-foreground/20 bg-card shadow-[0_20px_40px_-24px_hsl(222_47%_11%/0.18)] -translate-y-0.5 motion-reduce:translate-y-0' : 'border-foreground/[0.08] bg-card/60'}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
                        {String(i + 1).padStart(2, '0')} · {t(step.labelKey)}
                      </span>
                      <step.icon className={`w-[18px] h-[18px] transition-colors ${isActive ? 'text-primary' : 'text-foreground/50'}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="font-display text-[17px] font-semibold text-foreground tracking-[-0.01em] mb-2 leading-[1.2]">
                      {t(step.titleKey)}
                    </h3>
                    <p id={`connected-step-${i}-body`} className="text-[13.5px] text-muted-foreground leading-[1.55] mb-4">
                      {t(step.bodyKey)}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/70">
                      <Check className="w-3 h-3 text-primary shrink-0" strokeWidth={2.5} />
                      {t(step.tagKey)}
                    </span>
                  </div>
                </button>
                </ScrollReveal>
              );
            })}
          </div>
        </div>

        <p className="mt-10 lg:mt-12 text-[12.5px] text-muted-foreground/70 leading-[1.6] max-w-[760px] border-t border-foreground/[0.07] pt-6">
          {t('landing.connectedDisclaimer')}
        </p>
      </div>
    </section>
  );
}
