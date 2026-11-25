import { Link } from 'react-router-dom';
import { openCookieSettings } from '@/lib/consent';
import logo from '@/assets/logo.png';
import { useI18n } from '@/lib/i18n';
import { ArrowUpRight } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

declare const __BUILD_TIME__: string;

const DATE_LOCALES: Record<string, string> = { da: 'da-DK', en: 'en-GB', de: 'de-DE' };

export function Footer() {
  const { t, locale } = useI18n();
  const buildDate = new Date(__BUILD_TIME__);
  const buildLabel = new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(buildDate);

  return (
    <footer className="relative border-t border-foreground/[0.07] bg-background overflow-hidden">
      {/* Oversized wordmark — editorial signature */}
      <div className="max-w-[1340px] mx-auto px-5 lg:px-10 pt-24 pb-12 lg:pt-32 lg:pb-16">
        <ScrollReveal y={20} duration={0.9} className="grid grid-cols-12 gap-6 lg:gap-10 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-7">
            <div className="flex items-center gap-3 mb-7">
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
                {t('landing.footerEyebrow')}
              </span>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
            <h3 className="font-display text-[clamp(2rem,5vw,4rem)] text-foreground tracking-[-0.04em] leading-[0.95]">
              {t('landing.footerHeadlinePre')}{' '}
              <span className="text-primary">{t('landing.footerHeadlineItalic')}</span>
              <span className="text-primary">.</span>
            </h3>
          </div>
          <div className="col-span-12 lg:col-span-5 lg:pl-10 lg:border-l lg:border-foreground/[0.07] flex flex-col justify-end">
            <Link
              to={`/${locale}/auth/register-company`}
              className="group inline-flex items-center justify-between border-b border-foreground/15 hover:border-foreground transition-colors pb-3 text-[15px] font-display font-medium text-foreground"
            >
              <span>{t('landing.footerCtaTrial')}</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.5} />
            </Link>
            <p className="mt-4 text-[12.5px] text-muted-foreground/80 leading-[1.5]">
              {t('landing.footerCtaNote')}
            </p>
          </div>
        </ScrollReveal>

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
              {t('landing.footerProductLabel')}
            </span>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">{t('landing.features')}</a></li>
              <li><a href="#pricing" className="hover:text-foreground transition-colors">{t('landing.pricing')}</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              <li><Link to={`/${locale}/guide`} className="hover:text-foreground transition-colors">{t('guide.footerLink')}</Link></li>
            </ul>
          </div>

          <div className="col-span-6 lg:col-span-3">
            <span className="block text-[10.5px] uppercase tracking-[0.2em] font-mono text-muted-foreground/60 mb-4">
              {t('landing.footerCompanyLabel')}
            </span>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              <li>
                <Link to={`/${locale}/privacy`} className="hover:text-foreground transition-colors">
                  {t('landing.footerPrivacy')}
                </Link>
              </li>
              <li>
                <button type="button" onClick={openCookieSettings} className="hover:text-foreground transition-colors">
                  {t('cookie.settings')}
                </button>
              </li>
              <li>
                <Link to={`/${locale}/terms`} className="hover:text-foreground transition-colors">
                  {t('landing.footerTerms')}
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
            <Link to={`/${locale}/dpa`} className="text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors">
              {t('landing.footerDpa')}
            </Link>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-foreground/[0.04] flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/40 font-mono">
            © {new Date().getFullYear()} AI Agency Danmark · CVR 45949923 · {t('landing.footerBuiltIn')}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/30 tracking-[0.18em] uppercase hidden md:inline" title={buildDate.toISOString()}>
            {t('landing.footerLastUpdated')} {buildLabel}
          </span>
        </div>
      </div>
    </footer>
  );
}
