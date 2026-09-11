import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';

const SITE_URL = 'https://aiagencydanmark.dk';
const SOCIAL_IMAGE = `${SITE_URL}/social-card.png`;

const copy = {
  da: {
    homeTitle: 'AI Agency Danmark | CRM, drift og automatisering samlet ét sted',
    homeDescription: 'Saml leads, kunder, opgaver, økonomi og automatisering i én arbejdsflade bygget til danske virksomheder.',
    privacyTitle: 'Privatlivspolitik | AI Agency Danmark',
    privacyDescription: 'Læs hvordan AI Agency Danmark behandler og beskytter personoplysninger.',
    termsTitle: 'Vilkår og betingelser | AI Agency Danmark',
    termsDescription: 'Læs vilkårene for brug af AI Agency Danmark.',
    dpaTitle: 'Databehandleraftale | AI Agency Danmark',
    dpaDescription: 'Læs databehandleraftalen for AI Agency Danmark.',
  },
  en: {
    homeTitle: 'AI Agency Danmark | CRM, operations and automation in one place',
    homeDescription: 'Bring leads, clients, tasks, finance and automation into one workspace for growing companies.',
    privacyTitle: 'Privacy policy | AI Agency Danmark',
    privacyDescription: 'Learn how AI Agency Danmark processes and protects personal data.',
    termsTitle: 'Terms and conditions | AI Agency Danmark',
    termsDescription: 'Read the terms governing use of AI Agency Danmark.',
    dpaTitle: 'Data processing agreement | AI Agency Danmark',
    dpaDescription: 'Read the data processing agreement for AI Agency Danmark.',
  },
} as const;

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const firstSegment = pathname.split('/')[1];
    const locale = isLocale(firstSegment) && firstSegment === 'da' ? 'da' : 'en';
    const localized = copy[locale];
    const suffix = pathname.replace(/^\/(da|en)/, '') || '/';
    const isPrivate = /^\/(app|auth|admin)(\/|$)/.test(suffix);

    let title: string = localized.homeTitle;
    let description: string = localized.homeDescription;
    if (suffix === '/privacy') {
      title = localized.privacyTitle;
      description = localized.privacyDescription;
    } else if (suffix === '/terms') {
      title = localized.termsTitle;
      description = localized.termsDescription;
    } else if (suffix === '/dpa') {
      title = localized.dpaTitle;
      description = localized.dpaDescription;
    } else if (suffix !== '/' && !isPrivate) {
      title = `Side ikke fundet | AI Agency Danmark`;
      description = localized.homeDescription;
    }

    const canonicalPath = isPrivate ? `/${locale}` : `/${locale}${suffix === '/' ? '' : suffix}`;
    const canonical = `${SITE_URL}${canonicalPath}`;
    document.title = title;
    document.documentElement.lang = locale;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', isPrivate || (suffix !== '/' && !['/privacy', '/terms', '/dpa'].includes(suffix)) ? 'noindex, nofollow' : 'index, follow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[property="og:image"]', 'property', 'og:image', SOCIAL_IMAGE);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', SOCIAL_IMAGE);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;
  }, [pathname]);

  return null;
}
