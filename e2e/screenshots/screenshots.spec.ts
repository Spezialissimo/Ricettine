import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const writes: string[] = [];

// The README/docs images, taken on the demo site (see scripts/screenshots.sh). The language and theme are set the
// way the app keeps them (localStorage `ricettine.lang` / `ricettine.theme`), so each shot is explicit.
const OUT = process.env.SCREENSHOT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/images');


/**
 * The images show the real main-site UI over the seeded demo data: sign in once through the demo session (the
 * requests carry the demo site header, so the data is the demo database), then answer /api/setup/status with
 * `demo: false`, so the SPA drops the demo banner, notices and read-only restrictions. The shots only read: any
 * write request fails the test.
 */
async function prepare(page: Page, lang: 'it' | 'en', theme: 'light' | 'dark') {
  const api = page.context().request;
  await api.get('/api/me'); // 401, but sets the XSRF cookie
  const cookies = await page.context().cookies();
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
  const session = await api.post('/api/demo/session', { headers: { 'X-XSRF-TOKEN': xsrf } });
  expect(session.ok()).toBe(true);
  await page.route('**/api/setup/status', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, demo: false, demoUrl: null } });
  });
  page.on('request', (req) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
  });
  await page.addInitScript(
    ([l, t]) => {
      localStorage.setItem('ricettine.lang', l);
      localStorage.setItem('ricettine.theme', t);
    },
    [lang, theme],
  );
}

/** Network idle, every visible image decoded, no toast on screen. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const imgs = Array.from(document.images).filter((i) => i.getBoundingClientRect().width > 0);
    return imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  await expect(page.locator('[aria-busy="true"], .skeleton, .spinner')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  // an in-app navigation keeps the feed's scroll position: every shot starts at the top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** Nothing of the demo mode may show: no banner, notice or toast, and no "demo" in the app's own chrome. */
async function assertMainSiteUi(page: Page) {
  // the banner's host element is always in the shell; it must render nothing
  await expect(page.locator('app-demo-banner')).toHaveText('');
  for (const sel of ['.demo-notice', '.demo-toast']) await expect(page.locator(sel)).toHaveCount(0);
  await expect(page.locator('header, nav, [role="status"], [role="alert"]').filter({ hasText: /demo/i })).toHaveCount(0);
  await expect(page.getByText(/non salvato|not saved/i)).toHaveCount(0);
  expect(writes).toEqual([]);
}

/** `endAfter`: cut the image just below this element, so it ends on a whole element (not mid-field). */
async function shoot(page: Page, name: string, endAfter?: Locator) {
  await settle(page);
  await assertMainSiteUi(page);
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (endAfter) {
    const box = await endAfter.boundingBox();
    const vp = page.viewportSize();
    if (!box || !vp) throw new Error(`no box to end ${name} on`);
    clip = { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, Math.ceil(box.y + box.height + 6)) };
  }
  await page.screenshot({ path: path.join(OUT, name), clip });
}

async function openRecipe(page: Page, title: string) {
  await page.goto('/');
  await page.getByText(title).first().click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

async function openEditor(page: Page) {
  await openRecipe(page, "Penne all'arrabbiata");
  // on the phone the actions sit behind a menu
  const more = page.getByRole('button', { name: 'Altre azioni' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('link', { name: /^(Edit|Modifica)$/ }).or(page.getByRole('menuitem', { name: /^(Edit|Modifica)$/ })).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+\/edit$/);
  await expect(page.getByLabel(/^(Title|Titolo)$/)).toHaveValue("Penne all'arrabbiata");
  // the main-site editor, not the demo's local one: its normal actions are there
  await expect(page.getByRole('button', { name: /^(More actions|Altre azioni)$/ }).or(page.getByRole('link', { name: /^(Preview|Anteprima)$/ })).first()).toBeVisible();
}

test.describe('desktop', { tag: '@desktop' }, () => {
  test('feed', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await page.goto('/');
    await expect(page.getByText('Spaghetti alla carbonara').first()).toBeVisible();
    await shoot(page, 'feed-desktop.png');
  });

  test('recipe', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await openRecipe(page, 'Spaghetti alla carbonara');
    await shoot(page, 'recipe-desktop.png');
  });

  test('editor', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await openEditor(page);
    await shoot(page, 'editor-desktop.png');
  });

  test('cookbook', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await page.goto('/cookbooks');
    await page.getByRole('link', { name: /Primi della domenica/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Primi della domenica', level: 1 })).toBeVisible();
    await shoot(page, 'cookbook-desktop.png');
  });

  test('recipe in English', async ({ page }) => {
    await prepare(page, 'en', 'light');
    await openRecipe(page, 'Spaghetti alla carbonara');
    await shoot(page, 'recipe-desktop-en.png');
  });

  test('recipe in the dark theme', async ({ page }) => {
    await prepare(page, 'it', 'dark');
    await openRecipe(page, 'Spaghetti alla carbonara');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await shoot(page, 'recipe-desktop-dark.png');
  });
});

test.describe('mobile', { tag: '@mobile' }, () => {
  test('feed', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await page.goto('/');
    await expect(page.getByText('Spaghetti alla carbonara').first()).toBeVisible();
    await shoot(page, 'feed-mobile.png');
  });

  test('recipe', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await openRecipe(page, 'Spaghetti alla carbonara');
    await shoot(page, 'recipe-mobile.png');
  });

  test('editor', async ({ page }) => {
    await prepare(page, 'it', 'light');
    await openEditor(page);
    await shoot(page, 'editor-mobile.png', page.locator('p', { hasText: 'Elencata in Scopri' }));
  });
});
