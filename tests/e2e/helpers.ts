import { type Page, type TestInfo, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Console/page-error noise that is not a real app fault. */
const IGNORED_ERRORS = [
  /ResizeObserver loop/i,
  /favicon/i,
  /Failed to load resource.*(favicon|\.map)/i,
  /\[vite\]/i,
  /Download the React DevTools/i,
];

export interface PageErrors {
  console: string[];
  page: string[];
}

/** Attach console-error + uncaught-exception capture to a page. */
export function captureErrors(page: Page): PageErrors {
  const errors: PageErrors = { console: [], page: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!IGNORED_ERRORS.some((re) => re.test(text))) errors.console.push(text);
    }
  });
  page.on("pageerror", (err) => {
    const text = err.message || String(err);
    if (!IGNORED_ERRORS.some((re) => re.test(text))) errors.page.push(text);
  });
  return errors;
}

/** The SPA has mounted and painted real content (not a blank root, not the crash boundary). */
export async function expectAppMounted(page: Page) {
  const root = page.locator("#root");
  await expect(root).toBeVisible();
  // #root must contain actual rendered nodes, not an empty shell.
  await expect.poll(async () => (await root.innerText()).trim().length, { timeout: 10_000 }).toBeGreaterThan(0);
  // The ErrorBoundary / NotFound fallback must not be showing. Match the standalone
  // "404" badge only (anchored) so we never false-positive on page data that merely
  // contains "404" — e.g. a customer whose timestamped name is "...95404 72".
  await expect(page.getByText(/something went wrong|page not found/i)).toHaveCount(0);
  await expect(page.getByText(/^\s*404\s*$/)).toHaveCount(0);
}

/** Run axe and fail only on critical violations; record all as annotations. */
export async function checkA11y(page: Page, info: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const bySeverity = (impact: string) => results.violations.filter((v) => v.impact === impact);
  const critical = bySeverity("critical");
  const serious = bySeverity("serious");
  info.annotations.push({
    type: "a11y",
    description: `critical=${critical.length} serious=${serious.length} moderate=${bySeverity("moderate").length} | ${results.violations.map((v) => v.id).join(", ")}`,
  });
  expect(critical, `Critical a11y violations: ${critical.map((v) => v.id).join(", ")}`).toHaveLength(0);
}
