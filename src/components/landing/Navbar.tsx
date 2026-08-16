import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, Shield, ArrowUpRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import logo from '@/assets/logo.png';
import LanguagePicker from '@/components/LanguagePicker';
import { useI18n, isLocale } from '@/lib/i18n';

export function Navbar() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const links = [
    { href: '#features', label: t('landing.features') },
    { href: '#pricing', label: t('landing.pricing') },
    { href: '#faq', label: 'FAQ' },
    { href: '#testimonials', label: locale === 'da' ? 'Kunder' : 'Customers' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-background/70 backdrop-blur-2xl border-b border-foreground/[0.06] shadow-[0_1px_0_0_hsl(var(--foreground)/0.04)]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1340px] mx-auto px-5 lg:px-10">
        <div className="h-[54px] flex items-center justify-between gap-10">
          {/* Brand */}
          <div className="flex items-center gap-10">
            <Link to={`/${locale}`} className="flex items-center gap-2.5 group shrink-0">
              <div className="relative">
                <img src={logo} alt="AI Agency Danmark" className="h-[26px] w-auto" loading="eager" width="26" height="26" />
                <span className="absolute -inset-2 rounded-full bg-primary/15 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
              <span className="font-display text-[14px] font-semibold text-foreground tracking-[-0.025em] hidden sm:inline leading-none">
                AI Agency<span className="text-primary">.</span>
              </span>
            </Link>

            {/* Inline nav — minimal, tight, premium */}
            <div className="hidden lg:flex items-center gap-7">
              {links.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="relative text-[13px] font-medium text-muted-foreground hover:text-foreground py-1 transition-colors group"
                >
                  {link.label}
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-foreground scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </a>
              ))}
            </div>
          </div>

          {/* Right cluster */}
          <div className="hidden md:flex items-center gap-1">
            <Link to={`/${locale}/admin`} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors p-2" title="Admin">
              <Shield className="w-3 h-3" />
            </Link>
            <LanguagePicker />
            <div className="w-px h-4 bg-foreground/10 mx-2" />
            <Button asChild variant="ghost" size="sm" className="text-[13px] text-muted-foreground h-8 hover:text-foreground hover:bg-transparent font-medium px-3">
              <Link to={`/${locale}/auth/login`}>{t('landing.login')}</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="h-8 px-3.5 text-[12.5px] font-medium rounded-[6px] bg-foreground text-background hover:bg-foreground border-0 group transition-all
                shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_1px_2px_hsl(222_47%_11%/0.2)]
                hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22),0_2px_8px_-2px_hsl(222_47%_11%/0.3)]"
            >
              <Link to={`/${locale}/auth/register-company`}>
                {t('landing.signup')}
                <ArrowUpRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </Button>
          </div>

          <button className="md:hidden text-muted-foreground" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden py-5 border-t border-foreground/[0.06] space-y-1 animate-fade-in">
            {links.map(link => (
              <a key={link.href} href={link.href} className="block text-sm text-muted-foreground hover:text-foreground py-2.5 font-medium" onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
            <div className="flex items-center gap-2 pt-4 border-t border-foreground/[0.06] mt-4">
              <LanguagePicker />
              <Button asChild variant="ghost" size="sm" className="h-9 text-[13px]">
                <Link to={`/${locale}/auth/login`}>{t('landing.login')}</Link>
              </Button>
              <Button asChild size="sm" className="h-9 text-[13px] rounded-[6px] bg-foreground text-background border-0">
                <Link to={`/${locale}/auth/register-company`}>{t('landing.signup')}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
