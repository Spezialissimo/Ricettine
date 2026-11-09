import { test as base } from '@playwright/test';

/**
 * The specs make extra browser contexts (a second user, an anonymous visitor) with `browser.newContext`.
 * Playwright traces and screenshots those on failure, but never closes them, so each one would live
 * until the worker exits. This `test` closes whatever a test opened, after the test, pass or fail (the
 * failure trace and screenshot are still kept). Contexts made before the test, e.g. in a `beforeAll`
 * shared by a serial describe, are left alone.
 */
export const test = base.extend<{ closeOpenedContexts: void }>({
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use();
      for (const context of browser.contexts()) {
        if (!before.has(context)) await context.close().catch(() => {});
      }
    },
    { auto: true },
  ],
});
