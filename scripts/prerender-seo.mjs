#!/usr/bin/env node
// Runs after `vite build`: writes dist/<locale>[/<page>].html for every public
// route. See src/lib/seo/prerender.mjs for why.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, PAGES, pageMeta, renderHead, injectRoot, homeBody, legalHeadings, legalBody, navLinks } from '../src/lib/seo/prerender.mjs';

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
const LEGAL_SRC = { '/privacy': 'PrivacyPolicy', '/terms': 'TermsOfService', '/dpa': 'DataProcessingAgreement' };
const LABELS = {
  da: { home: 'Forside', privacy: 'Privatlivspolitik', terms: 'Vilkår', dpa: 'Databehandleraftale' },
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
