import { expect, test } from '@playwright/test';
import { newContext, newUserPage, publishRecipe } from './helpers';

type Counters = { requests: number; releases: number };
declare global {
  interface Window { __wl: Counters }
}

test('keep screen on requests and releases a wake lock; absent API hides it', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'wake');
  const { shareUrl } = await publishRecipe(page, { title: 'Late night soup', ingredients: ['salt'], steps: ['Stir'] });
  await context.close();
  const path = new URL(shareUrl).pathname;

  const withApi = await newContext(browser, testInfo);
  await withApi.addInitScript(() => {
    window.__wl = { requests: 0, releases: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wl.requests++;
          const s = new EventTarget() as EventTarget & { released: boolean; release(): Promise<void> };
          s.released = false;
          s.release = async () => { s.released = true; window.__wl.releases++; s.dispatchEvent(new Event('release')); };
          return s;
        },
      },
    });
  });
  const r = await withApi.newPage();
  await r.goto(path);
  const box = r.getByRole('checkbox', { name: 'Keep screen on' });
  await box.check();
  await expect.poll(() => r.evaluate(() => window.__wl.requests)).toBe(1);
  await box.uncheck();
  await expect.poll(() => r.evaluate(() => window.__wl.releases)).toBe(1);
  await withApi.close();

  const without = await newContext(browser, testInfo);
  await without.addInitScript(() => {
    delete (Navigator.prototype as unknown as { wakeLock?: unknown }).wakeLock;
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });
  const w = await without.newPage();
  await w.goto(path);
  await expect(w.getByRole('heading', { name: 'Late night soup', level: 1 })).toBeVisible();
  await expect(w.getByRole('checkbox', { name: 'Keep screen on' })).toHaveCount(0);
  await without.close();
});
