import { expect, test } from '@playwright/test';
import { person } from './helpers';

test('repeated wrong passwords for one account lock the login form with a clear message', async ({ page }, testInfo) => {
  const who = person(testInfo, 'ratelimit');
  await page.goto('/login');
  for (let i = 0; i < 11; i++) {
    await page.getByLabel('Email', { exact: true }).fill(who.email);
    await page.getByLabel('Password').fill(`wrong-password-${i}`);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  await expect(page.getByRole('alert')).toHaveText('Too many attempts. Please wait a few minutes and try again.');
});
