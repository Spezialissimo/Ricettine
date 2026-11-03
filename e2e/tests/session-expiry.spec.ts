import { expect, test } from '@playwright/test';
import { newUserPage } from './helpers';

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
