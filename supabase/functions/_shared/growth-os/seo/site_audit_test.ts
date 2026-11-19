// Ported from ~/seo-autopilot/src/audit.test.ts.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseSitemapXml,
  analyzeHtml,
  findPageIssues,
  scorePage,
  siteScoreFromPages,
  diffPageFields,
  emptyAnalysis,
} from "./site-audit.ts";

Deno.test('parseSitemapXml: urlset giver sider', () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.dk/a</loc></url><url><loc>https://x.dk/b</loc></url></urlset>`;
  const { urls, sitemaps } = parseSitemapXml(xml);
  assertEquals(urls, ['https://x.dk/a', 'https://x.dk/b']);
  assertEquals(sitemaps, []);
});

Deno.test('parseSitemapXml: sitemapindex giver child-sitemaps', () => {
  const xml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x.dk/sitemap-pages.xml</loc></sitemap></sitemapindex>`;
  const { urls, sitemaps } = parseSitemapXml(xml);
  assertEquals(urls, []);
  assertEquals(sitemaps, ['https://x.dk/sitemap-pages.xml']);
});

Deno.test('parseSitemapXml: afkoder XML-entiteter i loc', () => {
  const xml = `<urlset><url><loc>https://x.dk/a?x=1&amp;y=2</loc></url></urlset>`;
  const { urls } = parseSitemapXml(xml);
  assertEquals(urls, ['https://x.dk/a?x=1&y=2']);
});

Deno.test('analyzeHtml: SPA uden server-rendering (0 ord, intet h1)', () => {
  const html = `<html><head><title>Forside</title></head><body><div id="root"></div><script>var x=1;</script></body></html>`;
  const a = analyzeHtml(html, 'https://aiagencydanmark.dk');
  assertEquals(a.wordCount, 0);
  assertEquals(a.h1Count, 0);
  assertEquals(a.title, 'Forside');
});

Deno.test('analyzeHtml: fuld side med alle signaler', () => {
  const html = `
    <html lang="da">
    <head>
      <title>Hvad er CRM?</title>
      <meta name="description" content="En guide til CRM-systemer for danske virksomheder, hvad det er og hvordan det bruges i praksis.">
      <link rel="canonical" href="https://x.dk/crm">
      <meta property="og:image" content="https://x.dk/og.png">
      <script type="application/ld+json">{"@type": "FAQPage"}</script>
    </head>
    <body>
      <h1>Hvad er CRM?</h1>
      <p>CRM står for customer relationship management og handler om kunderelationer.</p>
      <a href="/om-os">Om os</a>
      <a href="https://x.dk/kontakt">Kontakt</a>
      <a href="https://andet-site.dk">Andet site</a>
    </body>
    </html>`;
  const a = analyzeHtml(html, 'https://x.dk');
  assertEquals(a.title, 'Hvad er CRM?');
  assertEquals(a.canonical, 'https://x.dk/crm');
  assertEquals(a.lang, 'da');
  assertEquals(a.h1Count, 1);
  assert(a.wordCount > 5);
  assertEquals(a.jsonLdTypes, ['FAQPage']);
  assertEquals(a.hasOgImage, true);
  assertEquals(a.internalLinks, 2);
});

Deno.test('findPageIssues: fejlstatus giver kun ét high-fund', () => {
  const issues = findPageIssues('https://x.dk/a', emptyAnalysis(), 404);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].severity, 'high');
});

Deno.test('findPageIssues: tom SPA-side udløser flere high-fund', () => {
  const issues = findPageIssues('https://x.dk/a', emptyAnalysis(), 200);
  const high = issues.filter((i) => i.severity === 'high');
  assert(high.length >= 2); // 0 ord + ingen h1 + ingen title
});

Deno.test('findPageIssues: canonical der peger et andet sted er high', () => {
  const a = { ...emptyAnalysis(), title: 'T', metaDescription: 'x'.repeat(80), wordCount: 100, h1Count: 1, canonical: 'https://x.dk/da', lang: 'da', jsonLdTypes: ['WebPage'], hasOgImage: true, internalLinks: 3 };
  const issues = findPageIssues('https://x.dk/om-os', a, 200);
  assert(issues.some((i) => i.severity === 'high' && i.issue.includes('Canonical')));
});

Deno.test('findPageIssues: perfekt side giver ingen fund', () => {
  const a = { ...emptyAnalysis(), title: 'En god titel', metaDescription: 'x'.repeat(80), wordCount: 300, h1Count: 1, canonical: 'https://x.dk/om-os', lang: 'da', jsonLdTypes: ['WebPage'], hasOgImage: true, internalLinks: 3 };
  const issues = findPageIssues('https://x.dk/om-os', a, 200);
  assertEquals(issues, []);
});

Deno.test('scorePage: ingen fund giver 100', () => {
  assertEquals(scorePage([]), 100);
});

Deno.test('scorePage: trækker point efter sværhedsgrad og clamper ved 0', () => {
  const many = Array.from({ length: 20 }, () => ({ severity: 'high' as const, issue: 'x', fix: 'y' }));
  assertEquals(scorePage(many), 0);
  assertEquals(scorePage([{ severity: 'low', issue: 'x', fix: 'y' }]), 98);
});

Deno.test('siteScoreFromPages: gennemsnit, 0 ved ingen sider', () => {
  assertEquals(siteScoreFromPages([100, 50]), 75);
  assertEquals(siteScoreFromPages([]), 0);
});

Deno.test('diffPageFields: finder ændrede felter', () => {
  const prev = { title: 'Gammel', meta_description: 'x', canonical: null, robots: null, h1_count: 0, word_count: 0, score: 50 };
  const curr = { ...emptyAnalysis(), title: 'Ny', metaDescription: 'x', h1Count: 1, wordCount: 10 };
  const changes = diffPageFields(prev, curr, 70);
  const fields = changes.map((c) => c.field).sort();
  assertEquals(fields, ['h1_count', 'score', 'title', 'word_count']);
});
