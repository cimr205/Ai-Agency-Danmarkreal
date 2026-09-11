import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { isLocale } from '@/lib/i18n';
import { SalesPdfDownload } from './SalesPdfDownload';

export function Hero() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  const modules = isDa
    ? ['CRM & salgspipeline', 'HR & medarbejdere', 'Fakturering', 'Marketing & Meta Ads', 'AI-assistent', 'E-mail & indbakke', 'Kalender & opgaver', 'Lead generation']
    : ['CRM & sales pipeline', 'HR & employees', 'Invoicing', 'Marketing & Meta Ads', 'AI assistant', 'Email & inbox', 'Calendar & tasks', 'Lead generation'];

  return (
    <section className="relative pt-24 lg:pt-28 pb-24 lg:pb-32 overflow-hidden" aria-label="Hero">
      {/* Clean warm-cream background — no purple */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 65% at 85% -5%, hsl(221 60% 52% / 0.07) 0%, transparent 55%), linear-gradient(180deg, hsl(42 22% 97%) 0%, hsl(40 18% 95%) 100%)',
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
            01 — {isDa ? 'Platformen' : 'The Platform'}
          </span>
          <div className="h-px w-24 bg-gradient-to-r from-foreground/25 to-transparent" />
          <span className="font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground/50">
            {isDa ? 'København · Est. 2024' : 'Copenhagen · Est. 2024'}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-x-6 gap-y-16 items-start">
          {/* LEFT — editorial content */}
          <div className="col-span-12 lg:col-span-7 lg:pr-6 relative">
            {/* Static status label */}
            <div className="inline-flex items-center gap-2 mb-8 -ml-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
              <span className="text-[11.5px] font-medium text-muted-foreground tracking-wide">
                {isDa ? 'AI-agenter til salg, HR & marketing' : 'AI agents for sales, HR & marketing'}
              </span>
            </div>

            {/* Editorial headline */}
            <h1 className="font-display text-foreground tracking-[-0.04em] leading-[0.92] mb-7 max-w-[700px]">
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold">
                {isDa ? 'Mindre stack.' : 'Less stack.'}
              </span>
              <span className="block text-[clamp(2.6rem,5.6vw,4.8rem)] font-semibold pl-[0.06em]">
                {isDa ? 'Mere ' : 'More '}
                <span
                  className="italic font-normal text-foreground/90 pr-1"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.01em' }}
                >
                  {isDa ? 'forretning' : 'business'}
                </span>
                <span className="text-primary">.</span>
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[16.5px] lg:text-[17.5px] text-muted-foreground/90 max-w-[510px] mb-10 leading-[1.55]">
              {isDa ? (
                <>
                  CRM, HR, finans, marketing og AI-agenter samlet i ét system.
                  <span className="text-foreground/70">
                    {' '}
                    Bygget i Danmark, til teams der har fået nok af 8 forskellige værktøjer.
                  </span>
                </>
              ) : (
                <>
                  CRM, HR, finance, marketing and AI agents in a single system.
                  <span className="text-foreground/70">
                    {' '}
                    Built in Denmark, for teams done juggling 8 disconnected tools.
                  </span>
                </>
              )}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 mb-12">
              <Button
                asChild
                size="lg"
                className="h-[46px] px-5 text-[13.5px] font-medium rounded-[7px] bg-foreground text-background hover:bg-foreground border-0 group relative overflow-hidden transition-all
                  shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(222_47%_11%/0.25),0_8px_24px_-6px_hsl(222_47%_11%/0.25)]
                  hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),0_2px_4px_hsl(222_47%_11%/0.3),0_14px_32px_-8px_hsl(222_47%_11%/0.35)]
                  hover:-translate-y-px"
              >
                <Link to={`/${locale}/auth/register-company`}>
                  {isDa ? 'Start gratis prøve' : 'Start free trial'}
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
                    {isDa ? 'Se hvordan det virker' : 'See how it works'}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </a>
              </Button>
              <SalesPdfDownload />
            </div>

            {/* Concrete trust facts */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-7 border-t border-foreground/[0.08] max-w-[520px]">
              {(isDa
                ? ['14 dages gratis prøve', 'CVR 45949923', 'Dansk support']
                : ['14-day free trial', 'CVR 45949923', 'Danish support']
              ).map((item) => (
                <span key={item} className="text-[12px] text-muted-foreground font-mono">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — editorial module inventory */}
          <div className="col-span-12 lg:col-span-5 relative hidden lg:flex flex-col justify-center">
            <div
              className="border border-foreground/[0.08] rounded-[14px] bg-card overflow-hidden
                shadow-[0_1px_0_0_hsl(0_0%_100%/0.7)_inset,0_4px_16px_-4px_hsl(222_47%_11%/0.08),0_20px_40px_-20px_hsl(222_47%_11%/0.12)]"
            >
              <div className="px-6 py-4 border-b border-foreground/[0.06] flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
                  {isDa ? 'Inkluderet i platformen' : 'Included in the platform'}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {String(modules.length).padStart(2, '0')} / {String(modules.length).padStart(2, '0')}
                </span>
              </div>
              <ul>
                {modules.map((m, i) => (
                  <li
                    key={m}
                    className="flex items-center gap-4 px-6 py-3.5 border-b border-foreground/[0.05] last:border-0"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground/40 w-5 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[13px] text-foreground/80 font-medium leading-snug">{m}</span>
                  </li>
                ))}
              </ul>
              <div className="px-6 py-4 border-t border-foreground/[0.06] bg-foreground/[0.015]">
                <span className="font-mono text-[10.5px] text-muted-foreground/60">
                  {isDa ? 'Kr 499/md · Én pris, alt inkluderet' : 'DKK 499/mo · One price, everything in'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
