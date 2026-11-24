#!/usr/bin/env node
// Runs after `vite build`: writes dist/<locale>[/<page>].html for every public
// route. See src/lib/seo/prerender.mjs for why.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, PAGES, pageMeta, renderHead, injectRoot, homeBody, legalHeadings, legalBody, navLinks, GUIDE_PATH_RE, articleBody, articleLang, guideIndexBody, guideSitemapEntries, addToSitemap } from '../src/lib/seo/prerender.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const seo = JSON.parse(read('src/lib/seo/seo-copy.json'));
const template = read('dist/index.html');

// Hero.tsx hard-codes its copy (Danish for /da, English otherwise).
const HERO = {
  da: { h1: 'Mindre stack. Mere forretning.', subtitle: 'CRM, HR, finans, marketing og AI-agenter samlet i ét system. Bygget i Danmark, til teams der har fået nok af 8 forskellige værktøjer.' },
  en: { h1: 'Less stack. More business.', subtitle: 'CRM, HR, finance, marketing and AI agents in a single system. Built in Denmark, for teams done juggling 8 disconnected tools.' },
};
const heroSrc = read('src/components/landing/Hero.tsx');
for (const h of Object.values(HERO)) for (const part of h.h1.split(/[ .]+/).filter((w) => w.length > 4)) {
  if (!heroSrc.includes(part)) throw new Error(`prerender: Hero.tsx no longer contains "${part}"; update HERO in scripts/prerender-seo.mjs`);
}
// Section h2s are hard-coded in their components too (not in messages/*.json).
HERO.da.headings = { features: 'Otte værktøjer. Ét sammenhængende system.', pricing: 'Én pris. Alt med. Ingen tier-spil.', faq: 'Spørgsmål, vi faktisk får.' };
HERO.en.headings = { features: 'Eight tools. One coherent system.', pricing: 'One price. Everything in. No tier games.', faq: 'Questions we actually get.' };
const HEADING_SRC = { features: 'Features', pricing: 'Pricing', faq: 'FAQ' };
for (const h of Object.values(HERO)) for (const [k, text] of Object.entries(h.headings)) {
  const src = read(`src/components/landing/${HEADING_SRC[k]}.tsx`);
  for (const part of text.split(/[ .,]+/).filter((w) => w.length > 4)) {
    if (!src.includes(part)) throw new Error(`prerender: ${HEADING_SRC[k]}.tsx no longer contains "${part}"; update HERO.headings in scripts/prerender-seo.mjs`);
  }
}
const LEGAL_SRC = { '/privacy': 'PrivacyPolicy', '/terms': 'TermsOfService', '/dpa': 'DataProcessingAgreement' };
const LABELS = {
  da: { home: 'Forside', guide: 'Guides', privacy: 'Privatlivspolitik', terms: 'Vilkår', dpa: 'Databehandleraftale' },
  en: { home: 'Home', privacy: 'Privacy policy', terms: 'Terms', dpa: 'Data processing agreement' },
};

let count = 0;
for (const locale of LOCALES) {
  const messages = JSON.parse(read(`src/messages/${locale}.json`));
  const isDa = locale === 'da';
  const nav = navLinks(locale, LABELS[isDa ? 'da' : 'en']);
  for (const page of PAGES) {
    const { title, description } = pageMeta(seo, locale, page);
    const body = page === '/'
      ? homeBody(messages, HERO[isDa ? 'da' : 'en'], nav)
      : legalBody(legalHeadings(read(`src/pages/legal/${LEGAL_SRC[page]}.tsx`), isDa), nav);
    const html = injectRoot(renderHead(template, { siteUrl: seo.siteUrl, locale, page, title, description }), body);
    const out = join(root, 'dist', `${locale}${page === '/' ? '' : page}.html`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    count++;
  }
}
console.log(`prerender-seo: wrote ${count} pages`);

// ── published guides ─────────────────────────────────────────────────────────
// Articles come from growth_seo_published_articles() (public RPC, anon key). If
// Supabase cannot be reached the build still succeeds: the guides are then only
// rendered in the browser until the next build.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let articles = [];
if (supabaseUrl && anonKey && seo.articlesCompanyId) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/growth_seo_published_articles`, {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _company: seo.articlesCompanyId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    articles = (await res.json()).filter((a) => GUIDE_PATH_RE.test(a.path) && !a.path.includes('..'));
  } catch (e) {
    console.warn(`prerender-seo: guides skipped (${e.message})`);
  }
}
if (articles.length) {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Markdown } = await import('react-markdown');
  for (const locale of LOCALES) {
    const mine = articles.filter((a) => articleLang(a) === locale);
    if (!mine.length) continue;
    const copy = seo.copy[locale] ?? seo.copy.en;
    const nav = navLinks(locale, LABELS[locale === 'da' ? 'da' : 'en']);
    const write = (page, title, description, body) => {
      const html = injectRoot(renderHead(template, { siteUrl: seo.siteUrl, locale, page, title, description, locales: [locale] }), body);
      const out = join(root, 'dist', `${locale}${page}.html`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, html);
    };
    write('/guide', copy.guideTitle, copy.guideDescription, guideIndexBody(mine, nav, locale));
    for (const a of mine) {
      const html = renderToStaticMarkup(createElement(Markdown, null, a.body));
      write(`/guide${a.path}`, `${a.title} | AI Agency Danmark`, a.meta_description || copy.guideDescription, articleBody(a, html, nav, locale));
    }
  }
  const sitemap = join(root, 'dist', 'sitemap.xml');
  writeFileSync(sitemap, addToSitemap(readFileSync(sitemap, 'utf8'), guideSitemapEntries(seo.siteUrl, articles)));
  console.log(`prerender-seo: wrote ${articles.length} guides (+ index) and added them to sitemap.xml`);
}
