// Build-time prerender for the public marketing pages.
//
// The site is a Vite SPA: without this, every URL returns the same index.html
// (one title, one canonical, an empty <div id="root">), so crawlers see no
// per-page metadata and no text. This writes one static HTML file per public
// route with its own <head> and the page's real copy inside #root. React's
// createRoot replaces that markup on load, so users get the normal app.
//
// The copy is taken from the same sources the components render (messages/*.json
// and the strings hard-coded in Hero.tsx / the legal pages), never invented here.

export const LOCALES = ['da', 'en', 'de'];
export const PAGES = ['/', '/privacy', '/terms', '/dpa'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Title/description per page; German uses the English copy, as SeoManager does. */
export function pageMeta(seo, locale, page) {
  const c = seo.copy[locale === 'da' ? 'da' : 'en'];
  const key = page === '/' ? 'home' : page.slice(1);
  return { title: c[`${key}Title`], description: c[`${key}Description`] };
}

export function pageUrl(siteUrl, locale, page) {
  return `${siteUrl}/${locale}${page === '/' ? '' : page}`;
}

/** Rewrites the <head> of the built index.html for one route. */
export function renderHead(html, { siteUrl, locale, page, title, description, locales = LOCALES }) {
  const url = pageUrl(siteUrl, locale, page);
  const alternates = [...locales.map((l) => [l, l]), ['x-default', 'da']]
    .map(([hl, l]) => `<link rel="alternate" hreflang="${hl}" href="${pageUrl(siteUrl, l, page)}" />`).join('\n    ');
  const ogLocale = { da: 'da_DK', en: 'en_US', de: 'de_DE' }[locale];
  const replace = (re, value, label) => {
    if (!re.test(html)) throw new Error(`prerender: ${label} not found in index.html`);
    html = html.replace(re, value);
  };
  replace(/<html lang="[^"]*"/, `<html lang="${locale}"`, 'html lang');
  replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, 'title');
  replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(description)}">`, 'meta description');
  replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
  replace(/(<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>\s*)+/, `${alternates}\n    `, 'hreflang');
  replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`, 'og:title');
  replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`, 'og:description');
  replace(/<meta property="og:locale" content="[^"]*"\s*\/>/, `<meta property="og:locale" content="${ogLocale}" />`, 'og:locale');
  replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(title)}" />`, 'twitter:title');
  replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`, 'twitter:description');
  return html;
}

export function injectRoot(html, body) {
  if (!html.includes('<div id="root"></div>')) throw new Error('prerender: empty #root not found in index.html');
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

const FEATURES = ['Crm', 'Ai', 'Hr', 'Invoice', 'Marketing', 'Calendar', 'Tasks', 'Inbox'];

/** Static copy of the landing page. `hero` comes from Hero.tsx (da / non-da);
 *  `hero.headings` holds the section h2s that Features/Pricing/FAQ hard-code, so
 *  crawlers see the same headings as users. Falls back to messages/*.json. */
export function homeBody(m, hero, nav) {
  const L = m.landing;
  const H = hero.headings || {};
  const f = FEATURES.map((k) => `<li><h3>${esc(L[`feature${k}`])}</h3><p>${esc(L[`feature${k}Desc`])}</p></li>`).join('');
  const pricing = Array.from({ length: 10 }, (_, i) => `<li>${esc(L[`pricingF${i + 1}`])}</li>`).join('');
  const faq = Array.from({ length: 5 }, (_, i) => `<h3>${esc(L[`faq${i + 1}q`])}</h3><p>${esc(L[`faq${i + 1}a`])}</p>`).join('');
  return `<main><h1>${esc(hero.h1)}</h1><p>${esc(hero.subtitle)}</p>`
    + `<section id="features"><h2>${esc(H.features || `${L.featuresTitle} ${L.featuresHighlight}`)}</h2><p>${esc(L.featuresSubtitle)}</p><ul>${f}</ul></section>`
    + `<section id="pricing"><h2>${esc(H.pricing || L.pricingTitle)}</h2><p>${esc(L.pricingDesc)}</p><p>499 kr. ${esc(L.pricingPer)}</p><ul>${pricing}</ul></section>`
    + `<section id="faq"><h2>${esc(H.faq || L.faqTitle)}</h2>${faq}</section></main>${nav}`;
}

/** h1/h2 headings of a legal page, read from its TSX source (`isDa ? 'x' : 'y'`). */
export function legalHeadings(tsx, isDa) {
  const out = [];
  for (const m of tsx.matchAll(/<(h1|h2)[^>]*>\{isDa \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'\}<\/\1>/g)) {
    out.push({ tag: m[1], text: (isDa ? m[2] : m[3]).replace(/\\'/g, "'") });
  }
  return out;
}

export function legalBody(headings, nav) {
  return `<main>${headings.map((h) => `<${h.tag}>${esc(h.text)}</${h.tag}>`).join('')}</main>${nav}`;
}

export function navLinks(locale, labels) {
  const items = [['/', labels.home], ...(labels.guide ? [['/guide', labels.guide]] : []), ['/privacy', labels.privacy], ['/terms', labels.terms], ['/dpa', labels.dpa]]
    .map(([p, l]) => `<li><a href="/${locale}${p === '/' ? '' : p}">${esc(l)}</a></li>`).join('');
  const langs = LOCALES.filter((l) => l !== locale).map((l) => `<li><a href="/${l}" hreflang="${l}">${l.toUpperCase()}</a></li>`).join('');
  return `<nav><ul>${items}${langs}</ul></nav>`;
}

// ── published guides (SEO autopilot articles, Danish only) ──────────────────

export const GUIDE_PATH_RE = /^\/[a-z0-9\-/]{1,120}$/;

/** Static body of one guide. `html` is the article's Markdown already rendered (no raw HTML allowed). */
export function articleBody(a, html, nav) {
  return `<main><p><a href="/da/guide">Alle guides</a></p><article lang="da"><h1>${esc(a.h1 || a.title)}</h1>${html}</article></main>${nav}`;
}

export function guideIndexBody(articles, nav) {
  const items = articles.map((a) => `<li><a href="/da/guide${a.path}">${esc(a.h1 || a.title)}</a>${a.meta_description ? `<p>${esc(a.meta_description)}</p>` : ''}</li>`).join('');
  return `<main><h1>Guides</h1><ul>${items}</ul></main>${nav}`;
}

/** <url> entries for the guide index and every article, inserted into sitemap.xml. */
export function guideSitemapEntries(siteUrl, articles) {
  const entry = (loc, lastmod, priority) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  const newest = articles[0]?.published_at?.slice(0, 10);
  return [
    ...(articles.length ? [entry(`${siteUrl}/da/guide`, newest, '0.7')] : []),
    ...articles.map((a) => entry(`${siteUrl}/da/guide${a.path}`, a.published_at.slice(0, 10), '0.6')),
  ].join('\n');
}

export function addToSitemap(xml, entries) {
  if (!entries) return xml;
  if (!xml.includes('</urlset>')) throw new Error('prerender: </urlset> not found in sitemap.xml');
  return xml.replace('</urlset>', `${entries}\n</urlset>`);
}
