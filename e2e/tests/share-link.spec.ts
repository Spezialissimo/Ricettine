import { expect } from '@playwright/test';
import { addStepPhoto, createRecipe, expectSaved, linkIn, newContext, newUserPage, openRecipeShare, recipeAction, test } from '../helpers';

test('share link: anonymous reader, author edit link, reset invalidates old link and photo', async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const desktop = project === 'desktop';
  const { page, who } = await newUserPage(browser, testInfo, 'share');
  await createRecipe(page, { title: 'Shared soup', ingredients: ['carrot'], steps: ['Chop', 'Boil'] });

  // a draft has no share section at all (no link, no "publish first" hints)
  await expect(page.getByRole('heading', { name: 'Share' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to cookbook', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-url]')).toHaveCount(0);

  await addStepPhoto(page, desktop);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  // the share link is not in the editor any more: Save opens the recipe at its one address, Share is there
  await expect(page.locator('[data-url]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]+$/);
  const oldUrl = await linkIn(await openRecipeShare(page, project));
  expect(new URL(oldUrl).pathname).toBe(new URL(page.url()).pathname);
  await page.keyboard.press('Escape');

  // anonymous reader
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(new URL(oldUrl).pathname);
  await expect(reader.getByRole('heading', { name: 'Shared soup' })).toBeVisible();
  await expect(reader.getByText('carrot')).toBeVisible();
  await expect(reader.getByText('Chop')).toBeVisible();
  await expect(reader.getByText('Boil')).toBeVisible();
  await expect(reader.getByText(who.displayName)).toBeVisible();
  await expect(reader.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(reader.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  const photo = reader.locator('ol.steps img[alt="Step 1"]');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const oldPhotoUrl = (await photo.getAttribute('src'))!;
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(200);

  if (desktop) {
    // the ingredients stay in view beside the steps
    await expect(reader.locator('section.ingredients')).toHaveCSS('position', 'sticky');
  }

  // reset (the author, in the recipe page's Share sheet): the page moves to the new link
  await page.goto(new URL(oldUrl).pathname);
  const sheet = await openRecipeShare(page, project);
  await sheet.getByRole('button', { name: 'Reset link' }).click();
  await page.getByRole('dialog', { name: 'Reset the share link?' }).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(new URL(oldUrl).pathname);
  const newUrl = page.url();
  expect(await linkIn(sheet)).toBe(newUrl); // the sheet shows the new link; close it
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();

  // the author edits from the page (Edit is the only way into the editor); the next autosave succeeds
  await recipeAction(page, 'Edit', project);
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  await page.getByLabel('Title').fill('Shared soup 2');
  await expectSaved(page);

  await reader.reload();
  await expect(reader.getByText('This recipe is not available')).toBeVisible();
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(404);

  await reader.goto(new URL(newUrl).pathname);
  await expect(reader.getByRole('heading', { name: 'Shared soup 2' })).toBeVisible();
});
