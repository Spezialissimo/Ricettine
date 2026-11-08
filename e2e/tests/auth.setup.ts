import { expect, test as setup } from '@playwright/test';
import { ADMIN, expectHome } from '../helpers';

// The first-run flow can only happen once per instance, so it lives in this setup project.
setup('fresh instance: / lands on /setup and the admin can be created', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up Ricettine' })).toBeVisible();

  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Display name').fill(ADMIN.displayName);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create administrator' }).click();

  await expectHome(page, ADMIN.displayName);
});
