import { Link, useParams } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { useI18n, isLocale } from '@/lib/i18n';
import { ArrowUpRight } from 'lucide-react';

export function Footer() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const isDa = locale === 'da';

  return (
    <footer className="relative border-t border-foreground/[0.07] bg-background overflow-hidden">
      {/* Oversized wordmark — editorial signature */}
      <div className="max-w-[1340px] mx-auto px-5 lg:px-10 pt-24 pb-12 lg:pt-32 lg:pb-16">
        <div className="grid grid-cols-12 gap-6 lg:gap-10 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-7">
            <div className="flex items-center gap-3 mb-7">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                {isDa ? 'Klar til at skifte?' : 'Ready to switch?'}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
            <h3 className="font-display text-[clamp(2rem,5vw,4rem)] text-foreground tracking-[-0.04em] leading-[0.95]">
              {isDa ? (
                <>Skift stack.{' '}
                  <span className="italic font-normal text-foreground/70" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Behold tiden
                  </span>
                  <span className="text-primary">.</span>
                </>
              ) : (
                <>Switch stacks.{' '}
                  <span className="italic font-normal text-foreground/70" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Keep the hours
                  </span>
                  <span className="text-primary">.</span>
                </>
              )}
            </h3>
          </div>
          <div className="col-span-12 lg:col-span-5 lg:pl-10 lg:border-l lg:border-foreground/[0.07] flex flex-col justify-end">
            <Link
              to={`/${locale}/auth/register-company`}
              className="group inline-flex items-center justify-between border-b border-foreground/15 hover:border-foreground transition-colors pb-3 text-[15px] font-display font-medium text-foreground"
            >
              <span>{isDa ? 'Start din 14-dages prøve' : 'Start your 14-day trial'}</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.5} />
            </Link>
            <p className="mt-4 text-[12.5px] text-muted-foreground/80 leading-[1.5]">
              {isDa ? 'Intet kort. Fuld adgang. Annullér når som helst.' : 'No card. Full access. Cancel anytime.'}
            </p>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-12 gap-6 pt-12 border-t border-foreground/[0.06]">
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-3">
            <Link to={`/${locale}`} className="flex items-center gap-2.5">
              <img src={logo} alt="AI Agency Danmark logo" className="h-6 w-auto opacity-70" loading="lazy" width="24" height="24" />
              <span className="font-display text-[14px] font-semibold text-foreground tracking-[-0.02em]">
                AI Agency<span className="text-primary">.</span>
              </span>
            </Link>
            <span className="text-[11px] text-muted-foreground/50 font-mono mt-2">
              CVR 45949923 · København, DK
            </span>
          </div>

          <div className="col-span-6 lg:col-span-3">
            <span className="block text-[10.5px] uppercase tracking-[0.2em] font-mono text-muted-foreground/60 mb-4">
              {isDa ? 'Produkt' : 'Product'}
            </span>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">{t('landing.features')}</a></li>
              <li><a href="#pricing" className="hover:text-foreground transition-colors">{t('landing.pricing')}</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div className="col-span-6 lg:col-span-3">
            <span className="block text-[10.5px] uppercase tracking-[0.2em] font-mono text-muted-foreground/60 mb-4">
              {isDa ? 'Selskab' : 'Company'}
            </span>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              <li>
                <Link to={`/${locale}/privacy`} className="hover:text-foreground transition-colors">
                  {isDa ? 'Privatlivspolitik' : 'Privacy'}
                </Link>
              </li>
              <li>
                <Link to={`/${locale}/terms`} className="hover:text-foreground transition-colors">
                  {isDa ? 'Vilkår' : 'Terms'}
                </Link>
              </li>
              <li>
                <Link to={`/${locale}/auth/login`} className="hover:text-foreground transition-colors">
                  {t('landing.login')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-12 lg:col-span-2 flex lg:justify-end items-start">
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-50 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              99.98% uptime
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-foreground/[0.04] flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/40 font-mono">
            © {new Date().getFullYear()} AI Agency Danmark ApS — {isDa ? 'Bygget i København' : 'Built in Copenhagen'}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/30 tracking-[0.18em] uppercase hidden md:inline">
            v 2.0
          </span>
        </div>
      </div>
    </footer>
  );
}
