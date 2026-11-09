import { expect } from '@playwright/test';
import { expectSaved, leaveUntouchedDraft, newRecipeLink, newUserPage, test } from '../helpers';

test('editor autosaves title and details; Done on an untouched draft deletes it', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'editor');

  await newRecipeLink(page, testInfo.project.name).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const editUrl = page.url();

  // the phone-only bottom bar
  const nextStep = page.getByRole('button', { name: '+ Next step' });
  if (desktop) await expect(nextStep).toBeHidden();
  else await expect(nextStep).toBeVisible();

  await page.getByLabel('Title').fill('Lasagne');
  await expectSaved(page);

  await page.getByRole('button', { name: '+ Prep time' }).click();
  const sheet = page.getByRole('dialog', { name: 'Times' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  if (desktop) expect(box.y).toBeGreaterThan(0); // centered dialog
  else expect(Math.round(box.y + box.height)).toBe(vp.height); // bottom sheet
  await sheet.getByRole('button', { name: '30m' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.locator('a.recipe')).toHaveCount(1);
  await expect(page.locator('a.recipe')).toContainText('Lasagne');

  // reopening shows what was saved
  await page.goto(editUrl);
  await expect(page.getByLabel('Title')).toHaveValue('Lasagne');
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);

  // a brand-new draft left empty is deleted on Done
  await leaveUntouchedDraft(page, testInfo.project.name, 1);
});

test('delete from the overflow menu after confirming', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'editdel');
  await newRecipeLink(page, testInfo.project.name).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel('Title').fill('Doomed');
  await expectSaved(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete recipe' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByText('You have no recipes yet.')).toBeVisible();
});
