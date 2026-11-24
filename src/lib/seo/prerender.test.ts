import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import seo from './seo-copy.json';
import { renderHead, injectRoot, legalHeadings, pageMeta, homeBody, navLinks, GUIDE_PATH_RE, guideIndexBody, articleBody, guideSitemapEntries, addToSitemap } from './prerender.mjs';
import da from '@/messages/da.json';

const template = readFileSync('index.html', 'utf8');

describe('prerender-seo', () => {
  it('gives each page its own www canonical, hreflang, title and lang', () => {
    const meta = pageMeta(seo, 'da', '/privacy');
    const html = renderHead(template, { siteUrl: seo.siteUrl, locale: 'da', page: '/privacy', ...meta });
    expect(html).toContain('<html lang="da"');
    expect(html).toContain('<title>Privatlivspolitik | AI Agency Danmark</title>');
    expect(html).toContain('<link rel="canonical" href="https://www.aiagencydanmark.dk/da/privacy" />');
    expect(html).toContain('hreflang="en" href="https://www.aiagencydanmark.dk/en/privacy"');
    expect(html).toContain('hreflang="x-default" href="https://www.aiagencydanmark.dk/da/privacy"');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/hreflang=/g)).toHaveLength(4);
    expect(html).not.toMatch(/https:\/\/aiagencydanmark\.dk/);
  });

  it('German pages use English titles like SeoManager', () => {
    expect(pageMeta(seo, 'de', '/').title).toBe(seo.copy.en.homeTitle);
  });

  it('puts real copy with one h1 into #root', () => {
    const body = homeBody(da, { h1: 'Mindre stack. Mere forretning.', subtitle: 'x' }, navLinks('da', { home: 'Forside', privacy: 'P', terms: 'T', dpa: 'D' }));
    const html = injectRoot(template, body);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain(da.landing.faq1q);
    expect(html).toContain('href="/da/privacy"');
    expect(html).not.toContain('undefined');
  });

  it('reads the legal page headings from source', () => {
    const src = readFileSync('src/pages/legal/PrivacyPolicy.tsx', 'utf8');
    const da = legalHeadings(src, true);
    expect(da[0]).toEqual({ tag: 'h1', text: 'Privatlivspolitik' });
    expect(da.length).toBeGreaterThan(5);
    expect(legalHeadings(src, false)[0].text).toBe('Privacy Policy');
  });

  it('fails loudly when index.html changes shape', () => {
    expect(() => renderHead('<html lang="da"><head></head></html>', { siteUrl: 'x', locale: 'da', page: '/', title: 't', description: 'd' })).toThrow(/prerender/);
  });
});

describe('published guides', () => {
  const articles = [
    { path: '/crm/gratis-crm', title: 'Gratis CRM', h1: 'Gratis CRM <b>', meta_description: 'Om gratis CRM', body: '', published_at: '2026-11-19T10:00:00Z' },
    { path: '/crm/ai-crm', title: 'AI CRM', h1: null, meta_description: null, body: '', published_at: '2026-11-18T10:00:00Z' },
  ];
  it('guide paths only allow clean slugs', () => {
    expect(GUIDE_PATH_RE.test('/crm/gratis-crm')).toBe(true);
    expect(GUIDE_PATH_RE.test('/../etc')).toBe(false);
    expect(GUIDE_PATH_RE.test('https://evil')).toBe(false);
  });
  it('index and article bodies escape titles and link under /da/guide', () => {
    expect(guideIndexBody(articles, '')).toContain('<a href="/da/guide/crm/gratis-crm">Gratis CRM &lt;b&gt;</a>');
    expect(articleBody(articles[1], '<p>x</p>', '')).toContain('<h1>AI CRM</h1><p>x</p>');
  });
  it('adds the guide index and every article to the sitemap', () => {
    const xml = addToSitemap('<urlset>\n</urlset>', guideSitemapEntries('https://www.x.dk', articles));
    expect(xml).toContain('<loc>https://www.x.dk/da/guide</loc>');
    expect(xml).toContain('<loc>https://www.x.dk/da/guide/crm/ai-crm</loc>\n    <lastmod>2026-11-18</lastmod>');
    expect(addToSitemap('<urlset></urlset>', '')).toBe('<urlset></urlset>');
  });
  it('puts each article under its own language', () => {
    const mixed = [
      { ...articles[0], lang: 'en', path: '/crm/what-is-crm' },
      { ...articles[1], lang: 'de', path: '/crm/was-ist-ein-crm' },
      { ...articles[1], lang: null, path: '/crm/ai-crm' },
    ];
    expect(articleBody(mixed[1], '<p>x</p>', '', 'de')).toContain('<a href="/de/guide">Alle Ratgeber</a><article lang="de">');
    expect(guideIndexBody([mixed[0]], '', 'en')).toContain('<a href="/en/guide/crm/what-is-crm">');
    const xml = guideSitemapEntries('https://www.x.dk', mixed);
    expect(xml).toContain('<loc>https://www.x.dk/en/guide/crm/what-is-crm</loc>');
    expect(xml).toContain('<loc>https://www.x.dk/de/guide</loc>');
    expect(xml).toContain('<loc>https://www.x.dk/da/guide/crm/ai-crm</loc>');
    expect(xml).not.toContain('/da/guide/crm/what-is-crm');
  });
  it('an article head lists only Danish alternates', () => {
    const html = renderHead(template, { siteUrl: 'https://www.x.dk', locale: 'da', page: '/guide/crm/ai-crm', title: 'T', description: 'D', locales: ['da'] });
    expect(html).toContain('<link rel="canonical" href="https://www.x.dk/da/guide/crm/ai-crm" />');
    expect(html).not.toContain('hreflang="en"');
  });
});
