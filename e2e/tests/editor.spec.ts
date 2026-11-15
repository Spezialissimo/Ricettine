import { expect } from '@playwright/test';
import { clickNewRecipe, expectSaved, leaveUntouchedDraft, newUserPage, test } from '../helpers';

test('editor autosaves title and details; Save shows the draft; Save on an untouched draft deletes it', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'editor');

  await clickNewRecipe(page, testInfo.project.name);
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const editUrl = page.url();

  // the phone-only bottom bar holds Publish
  const nextStep = page.locator('.bottom-bar').getByRole('button', { name: 'Publish', exact: true });
  if (desktop) await expect(nextStep).toBeHidden();
  else await expect(nextStep).toBeVisible();

  await page.getByLabel('Title').fill('Lasagne');
  await expectSaved(page);

  await page.getByRole('button', { name: '+ Prep time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Prep time' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  if (desktop) expect(box.y).toBeGreaterThan(0); // centered dialog
  else expect(Math.round(box.y + box.height)).toBe(vp.height); // bottom sheet
  await sheet.getByRole('button', { name: '30m' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();

  // Save (top right) stores it and shows the recipe; a draft says so
  await page.locator('.editor-header').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/view$/);
  await expect(page.getByText('Draft: only you can see this recipe.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lasagne', level: 1 })).toBeVisible();
  await page.goto('/kitchen/recipes');
  await expect(page.locator('a.recipe')).toHaveCount(1);
  await expect(page.locator('a.recipe')).toContainText('Lasagne');

  // reopening shows what was saved
  await page.goto(editUrl);
  await expect(page.getByLabel('Title')).toHaveValue('Lasagne');
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0); // replaced by Save
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/view$/);
  await page.goto('/kitchen/recipes');

  // a brand-new draft left empty is deleted on Save
  await leaveUntouchedDraft(page, testInfo.project.name, 1);
});

test('delete from the overflow menu after confirming', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'editdel');
  await clickNewRecipe(page, testInfo.project.name);
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel('Title').fill('Doomed');
  await expectSaved(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByText('You have no recipes yet.')).toBeVisible();
});
