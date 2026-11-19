import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import seo from '@/lib/seo/seo-copy.json';

// One canonical host: the apex domain 308-redirects to www, so every canonical,
// hreflang and og:url must point at www (shared with scripts/prerender-seo.mjs).
const SITE_URL = seo.siteUrl;
const SOCIAL_IMAGE = `${SITE_URL}/social-card.png`;
const copy = seo.copy;
const PUBLIC_PAGES = ['/', '/privacy', '/terms', '/dpa'];

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

/** Split "/de/app/x" into its locale and the rest. Exported for tests: German
 *  routes once kept their prefix and were all titled "page not found". */
export function splitLocalePath(pathname: string): { htmlLang: string; locale: 'da' | 'en'; suffix: string } {
  const firstSegment = pathname.split('/')[1];
  const htmlLang = isLocale(firstSegment) ? firstSegment : 'en';
  return {
    htmlLang,
    locale: htmlLang === 'da' ? 'da' : 'en',
    suffix: pathname.replace(/^\/(da|en|de)(?=\/|$)/, '') || '/',
  };
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { htmlLang, locale, suffix } = splitLocalePath(pathname);
    const localized = copy[locale];
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
      title = locale === 'da' ? 'Side ikke fundet | AI Agency Danmark' : htmlLang === 'de' ? 'Seite nicht gefunden | AI Agency Danmark' : 'Page not found | AI Agency Danmark';
      description = localized.homeDescription;
    }

    const canonicalPath = isPrivate ? `/${locale}` : `/${locale}${suffix === '/' ? '' : suffix}`;
    const canonical = `${SITE_URL}${canonicalPath}`;
    document.title = title;
    document.documentElement.lang = htmlLang;
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

    // hreflang alternates for this page (index.html only carries the home page's).
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    if (!isPrivate && PUBLIC_PAGES.includes(suffix)) {
      const path = suffix === '/' ? '' : suffix;
      for (const [lang, loc] of [['da', 'da'], ['en', 'en'], ['de', 'de'], ['x-default', 'da']] as const) {
        const alt = document.createElement('link');
        alt.rel = 'alternate';
        alt.hreflang = lang;
        alt.href = `${SITE_URL}/${loc}${path}`;
        document.head.appendChild(alt);
      }
    }
  }, [pathname]);

  return null;
}
