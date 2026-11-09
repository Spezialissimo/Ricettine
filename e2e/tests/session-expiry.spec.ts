import { expect } from '@playwright/test';
import { createRecipe, expectSaved, newUserPage, test } from '../helpers';

test('an expired session sends me to login and back to where I was', async ({ browser }, testInfo) => {
  const { who, context, page } = await newUserPage(browser, testInfo, 'expiry');
  try {
    await page.goto('/settings/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

    await context.clearCookies({ name: 'SESSION' });

    await page.getByLabel('Display name').fill(`${who.displayName} edited`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile$/);

    await page.getByLabel('Email', { exact: true }).fill(who.email);
    await page.getByLabel('Password').fill(who.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('an expired session while editing: log in again and the typed text is restored and saved', async ({ browser }, testInfo) => {
  const { who, context, page } = await newUserPage(browser, testInfo, 'expiry-editor');
  const editorUrl = await createRecipe(page, { title: 'Expiry stew', ingredients: ['beans'], steps: ['Soak'] });
  const step1 = page.getByRole('textbox', { name: 'Step 1' });

  await context.clearCookies({ name: 'SESSION' });
  await step1.fill('Soak overnight, then simmer');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`${new URL(editorUrl).pathname}$`));
  await expect(step1).toHaveValue('Soak overnight, then simmer');
  await expect(page.getByText('Changes you made earlier on this device had not been saved. They were restored.')).toBeVisible();
  await expectSaved(page);
  await page.reload();
  await expect(step1).toHaveValue('Soak overnight, then simmer');
});
