import { join } from 'node:path';
import { Page, expect, test } from '@playwright/test';
import { createCookbook, createRecipe, newContext, newUserPage } from './helpers';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'portrait-orientation6.jpg');

async function addStepPhoto(page: Page, desktop: boolean) {
  const chooser = page.waitForEvent('filechooser');
  if (desktop) {
    await page.getByRole('button', { name: 'Add photo to step 1' }).first().click();
  } else {
    await page.getByRole('textbox', { name: 'Step 1' }).click();
    await page.locator('.bottom-bar').getByRole('button', { name: 'Add photo to step 1' }).click();
  }
  await (await chooser).setFiles(FIXTURE);
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 1"]')).toBeVisible();
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();
}

const linkOf = async (page: Page) => (await page.locator('[data-url]').innerText()).trim();

async function publishWithPhoto(page: Page, title: string, desktop: boolean, withPhoto: boolean) {
  await createRecipe(page, { title, ingredients: ['salt'], steps: [`Cook ${title}`] });
  if (withPhoto) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add cover photo' }).click();
    await (await chooser).setFiles(FIXTURE);
    await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
    await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();
    await addStepPhoto(page, desktop);
  }
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('[data-url]')).toBeVisible();
  return new URL(await linkOf(page)).pathname;
}

async function addViaLink(page: Page, recipePath: string, book: string) {
  await page.goto(recipePath);
  await page.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: `Add to ${book}` }).click();
  await expect(page.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
}

test('cookbook link: anonymous reader, recipes through it, reset invalidates links and photos', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const a = await newUserPage(browser, testInfo, 'cklA');
  const b = await newUserPage(browser, testInfo, 'cklB');

  const bPath1 = await publishWithPhoto(b.page, 'Link soup', desktop, true);
  const bPath2 = await publishWithPhoto(b.page, 'Link stew', desktop, false);

  await createCookbook(a.page, 'Linked book');
  await addViaLink(a.page, bPath1, 'Linked book');
  await addViaLink(a.page, bPath2, 'Linked book');
  await a.page.goto('/cookbooks');
  await a.page.getByRole('link', { name: /Linked book/ }).click();
  await expect(a.page.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();
  const oldUrl = await linkOf(a.page);
  expect(oldUrl).toMatch(/\/c\/[A-Za-z0-9_-]+$/);
  const oldPath = new URL(oldUrl).pathname;

  // anonymous reader: cookbook, then a recipe with its photo, then back
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(oldPath);
  await expect(reader.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();
  await expect(reader.getByText(a.who.displayName)).toBeVisible();
  const card = reader.locator('li.card', { hasText: 'Link soup' });
  await expect(card).toBeVisible();
  const thumb = card.locator('img.thumb');
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  expect(await thumb.getAttribute('src')).toContain('?c=');
  await expect(reader.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(reader.getByRole('button', { name: 'Add to cookbook', exact: true })).toHaveCount(0);
  const cards = reader.locator('li.card');
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  if (desktop) expect(second.x).toBeGreaterThan(first.x);
  else expect(second.x).toBe(first.x);

  await card.getByRole('link').click();
  await expect(reader).toHaveURL(/\/c\/[A-Za-z0-9_-]+\/r\/[0-9a-f-]{36}$/);
  const oldRecipePath = new URL(reader.url()).pathname;
  await expect(reader.getByRole('heading', { name: 'Link soup', level: 1 })).toBeVisible();
  await expect(reader.getByText('Cook Link soup')).toBeVisible();
  const photo = reader.locator('ol.steps img[alt="Step 1"]');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const oldPhotoUrl = (await photo.getAttribute('src'))!;
  expect(oldPhotoUrl).toContain('?c=');
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(200);

  await reader.getByRole('link', { name: 'Back to Linked book' }).click();
  await expect(reader).toHaveURL(oldPath);
  await reader.locator('li.card', { hasText: 'Link stew' }).getByRole('link').click();
  await expect(reader.getByRole('heading', { name: 'Link stew', level: 1 })).toBeVisible();
  await expect(reader.getByText('Cook Link stew')).toBeVisible();
  await expect(reader.getByText('Cook Link soup')).toHaveCount(0);

  // reset
  await a.page.getByRole('button', { name: 'Reset link' }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => linkOf(a.page)).not.toBe(oldUrl);
  await expect(a.page.getByRole('status').getByText('Link reset')).toBeVisible();
  const newPath = new URL(await linkOf(a.page)).pathname;

  await reader.goto(oldPath);
  await expect(reader.getByText('This cookbook is not available')).toBeVisible();
  await reader.goto(oldRecipePath);
  await expect(reader.getByText('This recipe is not available')).toBeVisible();
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(404);

  await reader.goto(newPath);
  await expect(reader.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();
  await expect(reader.locator('li.card')).toHaveCount(2);

  // the recipe's own link is unaffected
  await b.page.goto(bPath1);
  await expect(b.page.getByRole('heading', { name: 'Link soup', level: 1 })).toBeVisible();
  await anon.close();
});

test('cover: the owner sets and removes a cover; members and link readers see it', async ({ browser }, testInfo) => {
  const a = await newUserPage(browser, testInfo, 'cvrA');
  await createCookbook(a.page, 'Covered book');
  await expect(a.page.getByRole('heading', { name: 'Covered book', level: 1 })).toBeVisible();
  const cookbookPath = new URL(a.page.url()).pathname;

  const chooser = a.page.waitForEvent('filechooser');
  await a.page.getByRole('button', { name: 'Add cover photo' }).click();
  await (await chooser).setFiles(FIXTURE);
  const cover = a.page.locator('img.cover');
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(a.page.getByRole('button', { name: 'Replace cover photo' })).toBeVisible();

  // My cookbooks shows the thumb
  await a.page.goto('/cookbooks');
  const thumb = a.page.locator('a.cookbook', { hasText: 'Covered book' }).locator('img.cover-thumb');
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // an anonymous reader sees it through the link
  await a.page.goto(cookbookPath);
  const linkPath = new URL((await a.page.locator('[data-url]').innerText()).trim()).pathname;
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(linkPath);
  const shown = reader.locator('img.cover');
  await expect(shown).toBeVisible();
  expect(await shown.getAttribute('src')).toContain('?c=');
  await expect.poll(() => shown.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Remove: gone after reload, for the owner and for the reader
  await a.page.getByRole('button', { name: 'Remove cover photo' }).click();
  await expect(a.page.locator('img.cover')).toHaveCount(0);
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Covered book', level: 1 })).toBeVisible();
  await expect(a.page.locator('img.cover')).toHaveCount(0);
  await reader.reload();
  await expect(reader.getByRole('heading', { name: 'Covered book', level: 1 })).toBeVisible();
  await expect(reader.locator('img.cover')).toHaveCount(0);
});
