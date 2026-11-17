import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import seo from './seo-copy.json';
import { renderHead, injectRoot, legalHeadings, pageMeta, homeBody, navLinks } from './prerender.mjs';
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
