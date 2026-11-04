import { expect, test } from '@playwright/test';
import { ADMIN, createInvitePath, logIn, logOut, newContext } from './helpers';

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
  const adminCtx = await newContext(browser, testInfo);
  const admin = await adminCtx.newPage();
  await admin.goto('/login');
  await logIn(admin, ADMIN);
  const invitePath = await createInvitePath(admin);
  await adminCtx.close();

  const ctx = await newContext(browser, testInfo);
  const page = await ctx.newPage();
  await page.goto(invitePath);
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email');
  await ctx.close();
});
