import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The README/docs images, taken on the demo site (see scripts/screenshots.sh). The language and theme are set the
// way the app keeps them (localStorage `ricettine.lang` / `ricettine.theme`), so each shot is explicit.
const OUT = process.env.SCREENSHOT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/images');


async function prepare(page: Page, lang: 'it' | 'en', theme: 'light' | 'dark') {
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

async function shoot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
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
    await shoot(page, 'editor-mobile.png');
  });
});
