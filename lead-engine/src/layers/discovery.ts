/**
 * Layer 1 — Discovery
 *
 * Uses Playwright (same approach as eneiromatos/TS-email-scraper) to search
 * Google Maps for businesses matching a keyword + location query.
 *
 * Returns an array of DiscoveredCompany objects with name, website, phone,
 * address and rating. The website field is what the crawler layer will visit.
 */

import { chromium, type Page } from 'playwright';
import type { DiscoveredCompany } from '../types.js';

const DELAY = (lo: number, hi: number) =>
  new Promise(r => setTimeout(r, lo + Math.random() * (hi - lo)));

async function dismissConsent(page: Page) {
  for (const label of ['Accept all', 'Alle akzeptieren', 'Accepter tout']) {
    try {
      const btn = page.locator(`button:has-text("${label}")`).first();
      if (await btn.count()) { await btn.click(); await DELAY(800, 1500); return; }
    } catch { /* ignore */ }
  }
}

async function scrollUntilFull(page: Page, target: number): Promise<void> {
  let prev = 0, stale = 0;
  while (true) {
    const count = await page.locator('[role="feed"] > div').count();
    if (count >= target || stale >= 5) break;
    stale = count === prev ? stale + 1 : 0;
    prev  = count;
    await page.evaluate(() => {
      const f = document.querySelector('[role="feed"]') as HTMLElement;
      if (f) f.scrollTop += 1200;
    });
    await DELAY(1200, 2500);
  }
}

async function extractCard(page: Page): Promise<Partial<DiscoveredCompany>> {
  const result: Partial<DiscoveredCompany> = { company_name: '', website: '', phone: '', address: '', rating: '' };

  try {
    const h1 = page.locator('h1').first();
    if (await h1.count()) result.company_name = (await h1.textContent() ?? '').trim();

    for (const sel of ['button[data-item-id="address"]', '[data-item-id*="address"]']) {
      const el = page.locator(sel).first();
      if (await el.count()) { result.address = (await el.textContent() ?? '').trim(); break; }
    }
    for (const sel of ['button[data-tooltip="Copy phone number"]', 'button[aria-label*="phone"]']) {
      const el = page.locator(sel).first();
      if (await el.count()) { result.phone = (await el.textContent() ?? '').trim(); break; }
    }
    for (const sel of ['a[data-item-id="authority"]', 'a[aria-label*="website"]']) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        const href = (await el.getAttribute('href') ?? '').trim();
        if (href.startsWith('http')) { result.website = href; break; }
      }
    }
    for (const sel of ['span[aria-hidden="true"][role="img"]', '.F7nice span[aria-hidden]']) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        const t = (await el.textContent() ?? '').trim();
        if (t && t[0] >= '0' && t[0] <= '9') { result.rating = t; break; }
      }
    }
  } catch { /* best effort */ }

  return result;
}

export async function discoverCompanies(
  query  : string,
  target : number,
): Promise<DiscoveredCompany[]> {
  const results: DiscoveredCompany[] = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx  = await browser.newContext({
    userAgent : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale    : 'en-US',
    viewport  : { width: 1366, height: 900 },
  });
  await ctx.addInitScript("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})");
  const page = await ctx.newPage();

  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await DELAY(2000, 4000);
    await dismissConsent(page);
    await scrollUntilFull(page, target);

    const cards = await page.locator('[role="feed"] > div').all();
    console.log(`[discovery] ${cards.length} cards found for "${query}"`);

    for (let i = 0; i < cards.length; i++) {
      try {
        await cards[i].scrollIntoViewIfNeeded();
        await cards[i].click();
        await page.waitForTimeout(1800 + Math.random() * 1200);

        const data = await extractCard(page);
        if (data.company_name) {
          results.push(data as DiscoveredCompany);
          console.log(`  ✓ [${i + 1}] ${data.company_name}`);
        }
        await DELAY(1000, 2000);
      } catch { continue; }
    }
  } finally {
    await browser.close();
  }

  return results;
}
