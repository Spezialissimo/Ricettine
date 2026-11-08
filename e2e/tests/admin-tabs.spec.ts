import { expect } from '@playwright/test';
import { ADMIN, logIn, newContext, test } from '../helpers';

// Regression: the heading and tabs live in AdminTabsComponent, whose styles once stayed in the host page's
// stylesheet (emulated encapsulation), so the tabs lost their touch targets and active styling.
test('admin tabs keep their 44px touch targets, active style and heading style', async ({ browser }, testInfo) => {
  const ctx = await newContext(browser, testInfo);
  const page = await ctx.newPage();
  await page.goto('/login');
  await logIn(page, ADMIN);
  await page.goto('/admin/invites');

  const invites = page.getByRole('navigation').getByRole('link', { name: 'Invites' });
  const users = page.getByRole('navigation').getByRole('link', { name: 'Users' });
  await expect(invites).toBeVisible();
  for (const tab of [invites, users]) {
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(invites).toHaveCSS('font-weight', '600');
  await expect(users).toHaveCSS('font-weight', '400');
  await expect(invites).toHaveCSS('color', 'rgb(200, 85, 61)');
  await expect(users).not.toHaveCSS('color', 'rgb(200, 85, 61)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(200, 85, 61)');
});
