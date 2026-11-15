import { Page, expect } from '@playwright/test';
import { FIXTURE_PHOTO, addCoverPhoto, addStepPhoto, createCookbook, createRecipe, editCookbook, expectCardLayout, newContext, newUserPage, openCookbookShare, recipeAction, recipeIdOf, recipeShareUrl, test } from '../helpers';

async function publishWithPhoto(page: Page, title: string, desktop: boolean, withPhoto: boolean) {
  await createRecipe(page, { title, ingredients: ['salt'], steps: [`Cook ${title}`] });
  if (withPhoto) {
    await addCoverPhoto(page);
    await addStepPhoto(page, desktop);
  }
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  return new URL(await recipeShareUrl(page, recipeIdOf(page.url()))).pathname;
}

async function addViaLink(page: Page, recipePath: string, book: string, project: string) {
  await page.goto(recipePath);
  await recipeAction(page, 'Add to cookbook', project);
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

  const oldPath = await createCookbook(a.page, 'Linked book'); // the one view is the share link
  expect(oldPath).toMatch(/^\/c\/[A-Za-z0-9_-]+$/);
  await addViaLink(a.page, bPath1, 'Linked book', testInfo.project.name);
  await addViaLink(a.page, bPath2, 'Linked book', testInfo.project.name);
  await a.page.goto('/cookbooks');
  await a.page.getByRole('link', { name: /Linked book/ }).click();
  await expect(a.page).toHaveURL(oldPath);
  await expect(a.page.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();

  // anonymous reader: cookbook, then a recipe with its photo, then back
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(oldPath);
  await expect(reader.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();
  await expect(reader.getByText(a.who.displayName)).toBeVisible();
  const card = reader.locator('.recipe-card', { hasText: 'Link soup' });
  await expect(card).toBeVisible();
  const thumb = card.locator('img.card-photo');
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  expect(await thumb.getAttribute('src')).toContain('?c=');
  await expect(reader.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible(); // the app's top bar, signed out
  await expect(reader.getByRole('button', { name: 'Add to cookbook', exact: true })).toHaveCount(0);
  await expect(reader.locator('app-cookbook-hero').getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  const cards = reader.locator('.recipe-card');
  await expectCardLayout(cards, testInfo.project.name);

  // the cookbook name comes with the recipe: the recipe page never re-reads the cookbook
  const cookbookApiPath = `/api${oldPath}`;
  let cookbookReads = 0;
  reader.on('request', (req) => {
    if (new URL(req.url()).pathname === cookbookApiPath) cookbookReads++;
  });
  await card.click();
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

  // no "Back to the cookbook" link any more: the browser's Back returns
  await expect(reader.getByRole('link', { name: /^Back to/ })).toHaveCount(0);
  expect(cookbookReads).toBe(0);
  await reader.goBack();
  await expect(reader).toHaveURL(oldPath);
  await reader.locator('.recipe-card', { hasText: 'Link stew' }).click();
  await expect(reader.getByRole('heading', { name: 'Link stew', level: 1 })).toBeVisible();
  await expect(reader.getByText('Cook Link stew')).toBeVisible();
  await expect(reader.getByText('Cook Link soup')).toHaveCount(0);

  // reset (the owner, in the Share sheet): the page moves to the new link
  const sheet = await openCookbookShare(a.page);
  await sheet.getByRole('button', { name: 'Reset link' }).click();
  await a.page.getByRole('dialog', { name: 'Reset the cookbook link?' }).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => new URL(a.page.url()).pathname).not.toBe(oldPath);
  const newPath = new URL(a.page.url()).pathname;
  expect(newPath).toMatch(/^\/c\/[A-Za-z0-9_-]+$/);

  await reader.goto(oldPath);
  await expect(reader.getByText('This cookbook is not available')).toBeVisible();
  await reader.goto(oldRecipePath);
  await expect(reader.getByText('This recipe is not available')).toBeVisible();
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(404);

  await reader.goto(newPath);
  await expect(reader.getByRole('heading', { name: 'Linked book', level: 1 })).toBeVisible();
  await expect(reader.locator('.recipe-card')).toHaveCount(2);

  // the recipe's own link is unaffected
  await b.page.goto(bPath1);
  await expect(b.page.getByRole('heading', { name: 'Link soup', level: 1 })).toBeVisible();
});

test('cover: the owner sets and removes a cover on the edit page; the view and link readers see it', async ({ browser }, testInfo) => {
  const a = await newUserPage(browser, testInfo, 'cvrA');
  const view = await createCookbook(a.page, 'Covered book');
  await editCookbook(a.page);

  const chooser = a.page.waitForEvent('filechooser');
  await a.page.getByRole('button', { name: 'Add cover photo' }).click();
  await (await chooser).setFiles(FIXTURE_PHOTO);
  const cover = a.page.locator('img.cover');
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(a.page.getByRole('button', { name: 'Replace cover photo' })).toBeVisible();
  // the edit page shows it at the view's 3:2 crop, not a wide strip
  const box = (await cover.boundingBox())!;
  expect(Math.abs(box.width / box.height - 1.5)).toBeLessThan(0.05);

  // My cookbooks shows the thumb
  await a.page.goto('/cookbooks');
  const thumb = a.page.locator('a.cookbook', { hasText: 'Covered book' }).locator('img.cover-thumb');
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // an anonymous reader sees it as the view's banner
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(view);
  const shown = reader.locator('app-cookbook-hero img.banner');
  await expect(shown).toBeVisible();
  expect(await shown.getAttribute('src')).toContain('?c=');
  await expect.poll(() => shown.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Remove (edit page): gone for the owner and for the reader
  await a.page.goto(view);
  await editCookbook(a.page);
  await a.page.getByRole('button', { name: 'Remove cover photo' }).click();
  await expect(a.page.locator('img.cover')).toHaveCount(0);
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Edit cookbook', level: 1 })).toBeVisible();
  await expect(a.page.locator('img.cover')).toHaveCount(0);
  await reader.reload();
  await expect(reader.getByRole('heading', { name: 'Covered book', level: 1 })).toBeVisible();
  await expect(reader.locator('img.banner')).toHaveCount(0);
});
