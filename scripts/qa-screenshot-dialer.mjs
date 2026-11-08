import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.QA_BASE_URL || 'http://localhost:8081';
const OUT = 'docs/design/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot({ name, width, height, dark, leads, phone }) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  await page.addInitScript((theme) => {
    window.localStorage.setItem('theme', theme);
  }, dark ? 'midnight' : 'daylight');
  const qs = new URLSearchParams({ demo: '1', leads: leads ? '1' : '0', phone: phone ? '1' : '0' });
  await page.goto(`${BASE}/__qa_preview/dialer?${qs}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) await acceptCookies.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await context.close();
  console.log('saved', name);
}

await shot({ name: 'dialer-1440-light-leads-phoneon', width: 1440, height: 900, dark: false, leads: true, phone: true });
await shot({ name: 'dialer-1440-dark-leads-phoneon', width: 1440, height: 900, dark: true, leads: true, phone: true });
await shot({ name: 'dialer-1440-light-noleads', width: 1440, height: 900, dark: false, leads: false, phone: true });
await shot({ name: 'dialer-1440-light-phoneoff', width: 1440, height: 900, dark: false, leads: true, phone: false });
await shot({ name: 'dialer-390-light-leads-phoneon', width: 390, height: 844, dark: false, leads: true, phone: true });
await shot({ name: 'dialer-390-dark-leads-phoneon', width: 390, height: 844, dark: true, leads: true, phone: true });

// Error toast demonstration — real showError()/explainError() pipeline, triggered
// via a simulated network failure, not fabricated text.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/__qa_preview/dialer?demo=1`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { showError } = await import('/src/lib/showError.tsx');
    const { AppError } = await import('/src/lib/functions.ts');
    showError(
      new AppError({ functionName: 'cvr-search', status: 503, kind: 'http', serverMessage: 'cvrapi.dk is not responding', requestId: 'req-demo-123' }),
      { action: 'hente CVR-oplysninger' },
    );
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/error-toast-real-pipeline.png`, fullPage: false });
  await context.close();
  console.log('saved error-toast-real-pipeline');
}

await browser.close();
