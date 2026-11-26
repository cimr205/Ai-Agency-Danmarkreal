import { useI18n } from '@/lib/i18n';
import { ScrollReveal } from './ScrollReveal';

export function Testimonials() {
  const { t } = useI18n();

  const pillars = [
    { n: '01', headKey: 'landing.pillar1Head', bodyKey: 'landing.pillar1Body' },
    { n: '02', headKey: 'landing.pillar2Head', bodyKey: 'landing.pillar2Body' },
    { n: '03', headKey: 'landing.pillar3Head', bodyKey: 'landing.pillar3Body' },
  ];

  return (
    <section
      id="testimonials"
      className="relative py-28 md:py-40 overflow-hidden"
      aria-label={t('landing.foundationAriaLabel')}
    >
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial marker */}
        <div className="grid grid-cols-12 gap-6 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                {t('landing.sectionFoundationLabel')}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.02] max-w-[680px]">
              {t('landing.foundationHeadlinePre')}{' '}
              <span className="text-primary">{t('landing.foundationHeadlineItalic')}</span>{' '}
              {t('landing.foundationHeadlinePost')}
            </h2>
            <p className="mt-5 text-[15px] text-muted-foreground/80 leading-[1.6] max-w-[480px]">
              {t('landing.foundationSubtitle')}
            </p>
          </div>
        </div>

        {/* Three pillars — editorial row */}
        <div className="grid grid-cols-12 gap-6 lg:gap-10 border-t border-foreground/[0.07] pt-14 lg:pt-20">
          {pillars.map((p, i) => (
            <ScrollReveal
              key={p.n}
              delay={i * 0.12}
              duration={0.8}
              y={0}
              x={24}
              className={`col-span-12 lg:col-span-4 ${i > 0 ? 'lg:pl-8 lg:border-l lg:border-foreground/[0.07]' : ''}`}
            >
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/60 uppercase block mb-6">
                {p.n}
              </span>
              <h3 className="font-display text-[20px] lg:text-[22px] font-semibold text-foreground tracking-[-0.02em] leading-[1.15] mb-4">
                {t(p.headKey)}
              </h3>
              <p className="text-[14px] text-muted-foreground leading-[1.65]">{t(p.bodyKey)}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
