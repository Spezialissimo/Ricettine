import { Browser, BrowserContext, TestInfo, test as base } from '@playwright/test';

const tracked = new WeakMap<TestInfo, BrowserContext[]>();

/**
 * Playwright's `trace` and `screenshot` options only cover the built-in `context` and `page`
 * fixtures, but the specs drive their own contexts (a second user, an anonymous visitor). This
 * `test` tracks every context made through `newContext`, so a failed test keeps a trace and a
 * screenshot of each open page next to the built-in ones, and no context outlives its test.
 */
export const test = base.extend<{ trackedContexts: void }>({
  trackedContexts: [
    async ({}, use, testInfo) => {
      const contexts: BrowserContext[] = [];
      tracked.set(testInfo, contexts);
      await use();
      const failed = testInfo.status !== testInfo.expectedStatus;
      for (const [n, context] of contexts.entries()) {
        if (failed) {
          for (const [i, page] of context.pages().entries()) {
            const body = await page.screenshot().catch(() => null);
            if (body) await testInfo.attach(`context-${n}-page-${i}.png`, { body, contentType: 'image/png' });
          }
        }
        // A spec may have closed the context already: then there is nothing left to stop.
        await context.tracing.stop(failed ? { path: testInfo.outputPath(`trace-context-${n}.zip`) } : {}).catch(() => {});
        await context.close().catch(() => {});
      }
    },
    { auto: true },
  ],
});

/** A fresh browser context configured exactly like the current project (viewport, touch, UA), traced and closed with the test. */
export async function newContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  await context.tracing.start({ screenshots: true, snapshots: true });
  tracked.get(testInfo)?.push(context);
  return context;
}
