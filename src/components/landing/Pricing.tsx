import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';
import { useI18n, isLocale } from '@/lib/i18n';

export function Pricing() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const featureKeys = [
    'landing.pricingF1', 'landing.pricingF2', 'landing.pricingF3',
    'landing.pricingF4', 'landing.pricingF5', 'landing.pricingF6',
    'landing.pricingF7', 'landing.pricingF8', 'landing.pricingF9',
    'landing.pricingF10',
  ];

  return (
    <section className="relative py-28 md:py-40 overflow-hidden" aria-label="Pricing">
      <div className="relative z-10 max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial marker */}
        <div className="grid grid-cols-12 gap-6 mb-16 lg:mb-20">
          <div className="col-span-12 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                04 — {isDa ? 'Pris' : 'Price'}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-9 lg:pl-8">
            <h2 className="font-display text-[clamp(1.9rem,3.8vw,3rem)] text-foreground tracking-[-0.03em] leading-[1.02] max-w-[680px]">
              {isDa ? (
                <>Én pris.{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Alt med
                  </span>. Ingen tier-spil.
                </>
              ) : (
                <>One price.{' '}
                  <span className="italic font-normal text-foreground/75" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Everything in
                  </span>. No tier games.
                </>
              )}
            </h2>
          </div>
        </div>

        {/* Asymmetric pricing — left negative space, right monolithic block */}
        <div className="grid grid-cols-12 gap-6 lg:gap-10 items-stretch">
          {/* Left side — editorial price column */}
          <div className="col-span-12 lg:col-span-5 lg:py-2 flex flex-col justify-between">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                {isDa ? 'Enterprise · 14 dages prøve' : 'Enterprise · 14-day trial'}
              </span>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-display text-[clamp(4.5rem,9vw,7.2rem)] font-semibold text-foreground leading-[0.85] tracking-[-0.045em]">
                  499
                </span>
                <div className="flex flex-col leading-tight pb-2">
                  <span className="text-[14px] font-display font-semibold text-foreground/80">kr</span>
                  <span className="text-[12px] text-muted-foreground font-mono mt-1">/{locale === 'da' ? 'md' : 'mo'}</span>
                </div>
              </div>
              <p className="mt-7 text-[15px] text-muted-foreground leading-[1.6] max-w-[360px]">
                {t('landing.pricingDesc')}
              </p>
            </div>

            <div className="mt-10">
              <Button
                asChild
                size="lg"
                className="h-[50px] px-6 text-[14px] font-medium rounded-[8px] bg-foreground text-background hover:bg-foreground border-0 group transition-all
                  shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(222_47%_11%/0.25),0_12px_32px_-8px_hsl(222_47%_11%/0.3)]
                  hover:-translate-y-px"
              >
                <Link to={`/${locale}/auth/register-company`}>
                  {t('landing.pricingCta')}
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <p className="mt-5 text-[12px] text-muted-foreground/70 font-mono">
                {t('landing.pricingNote')}
              </p>
            </div>
          </div>

          {/* Right side — included list, full block, hairline grid */}
          <div className="col-span-12 lg:col-span-7 lg:pl-10 lg:border-l lg:border-foreground/[0.07]">
            <div className="flex items-center justify-between mb-8">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                {t('landing.pricingIncluded')}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {featureKeys.length.toString().padStart(2, '0')} / {featureKeys.length.toString().padStart(2, '0')}
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {featureKeys.map((key, i) => (
                <li
                  key={key}
                  className="flex items-start gap-3 py-4 border-t border-foreground/[0.06] first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                >
                  <span className="font-mono text-[10px] text-muted-foreground/50 mt-1.5 w-5 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Check className="w-3.5 h-3.5 text-primary mt-1 shrink-0" strokeWidth={2.5} />
                  <span className="text-[13.5px] text-foreground/80 leading-[1.5]">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
