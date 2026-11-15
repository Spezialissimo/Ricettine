import type { Browser, BrowserContext, TestInfo } from '@playwright/test';

/**
 * A fresh context for the demo site: like `newContext` (the project's device and language settings), but every
 * request names the demo site in the `X-Ricettine-Site` header, as the edge proxy does for the demo host.
 */
export function newDemoContext(browser: Browser, testInfo: TestInfo, opts: { locale?: string } = {}): Promise<BrowserContext> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale } = testInfo.project.use;
  return browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale: opts.locale ?? locale,
    extraHTTPHeaders: { 'X-Ricettine-Site': 'demo' },
  });
}
