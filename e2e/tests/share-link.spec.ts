import { Page, expect } from '@playwright/test';
import { addStepPhoto, createRecipe, expectSaved, newContext, newUserPage, test } from '../helpers';

const shareUrl = async (page: Page) => (await page.locator('[data-url]').innerText()).trim();

test('share link: anonymous reader, author edit link, reset invalidates old link and photo', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page, who } = await newUserPage(browser, testInfo, 'share');
  await createRecipe(page, { title: 'Shared soup', ingredients: ['carrot'], steps: ['Chop', 'Boil'] });

  // a draft offers no link
  await expect(page.getByText('Publish to get a share link')).toBeVisible();
  await expect(page.locator('[data-url]')).toHaveCount(0);

  await addStepPhoto(page, desktop);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('[data-url]')).toBeVisible();
  const oldUrl = await shareUrl(page);
  expect(oldUrl).toMatch(/\/r\/[A-Za-z0-9_-]+$/);

  // anonymous reader
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(new URL(oldUrl).pathname);
  await expect(reader.getByRole('heading', { name: 'Shared soup' })).toBeVisible();
  await expect(reader.getByText('carrot')).toBeVisible();
  await expect(reader.getByText('Chop')).toBeVisible();
  await expect(reader.getByText('Boil')).toBeVisible();
  await expect(reader.getByText(who.displayName)).toBeVisible();
  await expect(reader.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(reader.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  const photo = reader.locator('ol.steps img[alt="Step 1"]');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const oldPhotoUrl = (await photo.getAttribute('src'))!;
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(200);

  if (desktop) {
    // ingredients column stays in view beside the steps
    await expect(reader.locator('.ingredients')).toHaveCSS('position', 'sticky');
  }

  // author viewing the link sees Edit
  await page.goto(new URL(oldUrl).pathname);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);

  // reset
  await page.getByRole('button', { name: 'Reset link' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => shareUrl(page)).not.toBe(oldUrl);
  await expect(page.getByRole('status').getByText('Link reset')).toBeVisible();
  const newUrl = await shareUrl(page);

  // next autosave succeeds with the new version
  await page.getByLabel('Title').fill('Shared soup 2');
  await expectSaved(page);

  await reader.reload();
  await expect(reader.getByText('This recipe is not available')).toBeVisible();
  expect((await reader.request.get(oldPhotoUrl)).status()).toBe(404);

  await reader.goto(new URL(newUrl).pathname);
  await expect(reader.getByRole('heading', { name: 'Shared soup 2' })).toBeVisible();
});
