import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useLocalPrice, formatMoney } from '@/lib/currency';
import { SalesPdfDownload } from './SalesPdfDownload';
import { ScrollReveal } from './ScrollReveal';
import dashboardHome from '@/assets/landing/dashboard-home.jpg';

const RETURNING_VISITOR_KEY = 'aiad_seen_landing';

export function Hero() {
  const { t, locale } = useI18n();
  const [isReturning, setIsReturning] = useState(false);
  const price = useLocalPrice();

  useEffect(() => {
    try {
      if (localStorage.getItem(RETURNING_VISITOR_KEY)) {
        setIsReturning(true);
      } else {
        localStorage.setItem(RETURNING_VISITOR_KEY, '1');
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — default copy is fine
    }
  }, []);

  return (
    <section className="relative pt-24 lg:pt-28 pb-24 lg:pb-32 overflow-hidden" aria-label="Hero">
      {/* Clean warm paper background */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 65% at 85% -5%, hsl(var(--primary) / 0.05) 0%, transparent 55%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(40 15% 95%) 100%)',
        }}
      />
      {/* Sparse dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)/0.09) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 55% 45% at 20% 25%, black 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-[1340px] mx-auto px-5 lg:px-10">
        {/* Editorial top marker */}
        <div className="hidden lg:flex items-center gap-3 mb-10 ml-[-2px]">
          <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
            {t('landing.heroEyebrow')}
          </span>
          <div className="h-px w-24 bg-gradient-to-r from-foreground/25 to-transparent" />
          <span className="font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground/50">
            {t('landing.heroLocation')}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-x-6 gap-y-16 items-start">
          {/* LEFT — editorial content */}
          <ScrollReveal className="col-span-12 lg:col-span-7 lg:pr-6 relative">
            {/* Static status label */}
            <div className="inline-flex items-center gap-2 mb-8 -ml-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
              <span className="text-[11.5px] font-medium text-muted-foreground tracking-wide">
                {isReturning ? t('landing.heroStatusReturning') : t('landing.heroStatus')}
              </span>
            </div>

            {/* Editorial headline */}
            <h1 className="font-display text-foreground tracking-[-0.04em] leading-[0.92] mb-7 max-w-[700px]">
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold">
                {t('landing.heroHeadlineLine1')}
              </span>
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold pl-[0.06em]">
                {t('landing.heroHeadlinePre')}
                <span className="relative inline-block text-primary">
                  {t('landing.heroHeadlineItalic')}
                  {/* Hand-drawn stroke — a human mark on a machined headline */}
                  <svg
                    aria-hidden
                    viewBox="0 0 300 24"
                    preserveAspectRatio="none"
                    className="hand-underline absolute left-[-2%] -bottom-[0.12em] w-[104%] h-[0.32em] overflow-visible"
                  >
                    <path
                      d="M4 15 C 60 6, 120 4, 180 9 S 270 16, 296 7"
                      pathLength={1}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                  </svg>
                </span>
                <span className="text-primary">.</span>
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[16.5px] lg:text-[17.5px] text-muted-foreground/90 max-w-[510px] mb-10 leading-[1.55]">
              {t('landing.heroSubtitleLead')}
              <span className="text-foreground/70"> {t('landing.heroSubtitleTail')}</span>
            </p>

            {/* CTAs */}
            <div className="relative flex flex-wrap items-center gap-3 mb-12">
              {/* Handwritten aside — reads like a note from the people behind it */}
              <div aria-hidden className="hidden lg:flex absolute left-[330px] -top-12 items-end gap-1 text-primary rotate-[-4deg] pointer-events-none">
                <svg viewBox="0 0 60 50" className="w-12 h-10 -mb-3 scale-x-[-1]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6 C 20 8, 40 20, 48 42" />
                  <path d="M38 36 L 48 43 L 52 31" />
                </svg>
                <span className="font-hand text-[22px] leading-none whitespace-nowrap">{t('landing.heroHandNote')}</span>
              </div>
              <Button
                asChild
                size="lg"
                className="h-[46px] px-5 text-[13.5px] font-medium rounded-[7px] bg-primary text-primary-foreground hover:bg-primary border-0 group relative overflow-hidden transition-all
                  shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(222_47%_11%/0.25),0_8px_24px_-6px_hsl(222_47%_11%/0.25)]
                  hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),0_2px_4px_hsl(222_47%_11%/0.3),0_14px_32px_-8px_hsl(222_47%_11%/0.35)]
                  hover:-translate-y-px"
              >
                <Link to={`/${locale}/auth/register-company`}>
                  {t('landing.heroCtaStart')}
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-[46px] px-4 text-[13.5px] font-medium text-foreground rounded-[7px] hover:bg-foreground/[0.04] group"
              >
                <a href="#features">
                  <span className="border-b border-foreground/25 group-hover:border-foreground/70 transition-colors pb-px">
                    {t('landing.heroCtaSecondary')}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </a>
              </Button>
            </div>

            {/* Concrete trust facts — risk-reversal stated up front, not buried in a FAQ */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-7 border-t border-foreground/[0.08] max-w-[520px]">
              {[t('landing.heroTrustTrial').replace('{zero}', formatMoney(price.currency, 0)), t('landing.heroTrustCancel'), t('landing.heroTrustCvr'), t('landing.heroTrustSupport')].map((item) => (
                <span key={item} className="text-[12px] text-muted-foreground font-mono">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-5">
              <SalesPdfDownload />
            </div>
          </ScrollReveal>

          {/* RIGHT — real product screenshot, as a tilted 3D mockup */}
          <ScrollReveal delay={0.15} className="col-span-12 lg:col-span-5 relative hidden lg:flex flex-col justify-center">
            <div className="relative group" style={{ perspective: '1400px' }}>
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[28px] pointer-events-none"
                style={{
                  background: 'radial-gradient(60% 60% at 50% 30%, hsl(var(--primary) / 0.08) 0%, transparent 70%)',
                }}
              />
              <div
                className="relative border border-foreground/[0.08] rounded-[14px] bg-card overflow-hidden transition-transform duration-700 ease-out
                  shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_4px_16px_-4px_hsl(222_47%_11%/0.1),0_40px_90px_-20px_hsl(222_47%_11%/0.3)]
                  [transform:rotateY(-7deg)_rotateX(4deg)] group-hover:[transform:rotateY(-2deg)_rotateX(1deg)]"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div className="px-4 py-3 border-b border-foreground/[0.06] flex items-center justify-between bg-foreground/[0.015]">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="w-2 h-2 rounded-full bg-foreground/15" />
                    <span className="w-2 h-2 rounded-full bg-foreground/15" />
                    <span className="w-2 h-2 rounded-full bg-foreground/15" />
                  </div>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground/60">
                    {t('landing.heroShowcaseLabel')}
                  </span>
                </div>
                <img
                  src={dashboardHome}
                  alt={t('landing.heroShowcaseCaption')}
                  className="w-full h-auto block"
                  loading="eager"
                  width="800"
                  height="679"
                />
              </div>
              <p className="mt-4 text-[11.5px] text-muted-foreground/70 font-mono text-center">
                {t('landing.heroShowcaseCaption')}
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
