/**
 * Layer 2 — Crawler  (powered by apify/crawlee)
 *
 * Takes a list of websites and deeply crawls each one using Crawlee's
 * PlaywrightCrawler. Targets pages most likely to contain contact data:
 *   - homepage
 *   - /contact, /contact-us, /kontakt, /impressum
 *   - /about, /about-us, /om-os, /team
 *   - footer links on the homepage
 *
 * Returns a map of domain → array of { url, html } page objects
 * ready for the extractor layer.
 */

import { PlaywrightCrawler, RequestQueue } from 'crawlee';
import { URL } from 'url';

export interface CrawledPage {
  url  : string;
  html : string;
  text : string;
}

// Paths to always try on each domain
const TARGET_PATHS = [
  '/contact', '/contact-us', '/kontakt', '/om-os',
  '/about',   '/about-us',   '/about/team',
  '/team',    '/impressum',  '/legal',
  '/info',    '/reach-us',   '/get-in-touch',
];

// Only follow internal links on these path patterns
const CONTACT_PATH_RE = /\/(contact|kontakt|about|team|impressum|reach|get-in-touch|om-os|info)/i;

function getDomain(rawUrl: string): string {
  try { return new URL(rawUrl).hostname.replace(/^www\./, ''); }
  catch { return rawUrl; }
}

function normalise(rawUrl: string): string {
  if (!rawUrl.startsWith('http')) return 'https://' + rawUrl;
  return rawUrl;
}

export async function crawlWebsites(
  websites: string[],
): Promise<Map<string, CrawledPage[]>> {
  const pages = new Map<string, CrawledPage[]>();

  for (const raw of websites) {
    if (!raw) continue;
    const base = normalise(raw);
    const domain = getDomain(base);
    const collected: CrawledPage[] = [];

    // Build seed URLs: homepage + all target paths
    const seeds = [
      base,
      ...TARGET_PATHS.map(p => {
        try { return new URL(p, base).href; }
        catch { return null; }
      }).filter(Boolean) as string[],
    ];

    try {
      const queue = await RequestQueue.open(`queue-${domain}-${Date.now()}`);
      for (const url of seeds) await queue.addRequest({ url, uniqueKey: url });

      const crawler = new PlaywrightCrawler({
        requestQueue: queue,
        maxRequestsPerCrawl: 20,
        maxConcurrency: 2,
        requestHandlerTimeoutSecs: 20,
        launchContext: {
          launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
          },
        },
        async requestHandler({ request, page, enqueueLinks }) {
          const html = await page.content();
          const text = await page.evaluate(() => document.body.innerText ?? '');
          collected.push({ url: request.url, html, text });

          // Enqueue internal links that look like contact/about pages
          await enqueueLinks({
            strategy: 'same-domain',
            transformRequestFunction(req) {
              return CONTACT_PATH_RE.test(req.url) ? req : false as unknown as typeof req;
            },
          });
        },
        failedRequestHandler({ request }) {
          console.warn(`[crawler] failed: ${request.url}`);
        },
      });

      await crawler.run();
      console.log(`[crawler] ${domain}: ${collected.length} pages crawled`);
    } catch (err) {
      console.warn(`[crawler] error on ${domain}: ${err}`);
    }

    if (collected.length) pages.set(domain, collected);
  }

  return pages;
}
