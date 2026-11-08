import { expect } from '@playwright/test';
import { ADMIN, inviteAsAdmin, logIn, logOut, newContext, test } from '../helpers';

test('login form: empty submit is announced and marked, wrong password shows the error', async ({ page }) => {
  await page.goto('/login');
  await logIn(page, ADMIN);
  await logOut(page);

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your email and password.');
  const email = page.getByLabel('Email', { exact: true });
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await email.getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy}`)).toBeVisible();

  await email.fill(ADMIN.email);
  await page.getByLabel('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
});

test('registration email field offers email autofill', async ({ browser }, testInfo) => {
  const invitePath = await inviteAsAdmin(browser, testInfo);

  const ctx = await newContext(browser, testInfo);
  const page = await ctx.newPage();
  await page.goto(invitePath);
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email');
});
