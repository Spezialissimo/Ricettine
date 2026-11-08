import { expect } from '@playwright/test';
import { createCookbook, newUserPage, publishRecipe, test } from '../helpers';

test('account deletion names the owned cookbooks and leaves the shared ones intact', async ({ browser }, testInfo) => {
  const leaver = await newUserPage(browser, testInfo, 'delA');
  const keeper = await newUserPage(browser, testInfo, 'delB');
  const pageA = leaver.page;
  const pageB = keeper.page;

  // B owns "Stew" and invites A as co-author
  await createCookbook(pageB, 'Stew');
  const stewPath = new URL(pageB.url()).pathname;
  await pageB.getByRole('button', { name: 'Invite co-author' }).click();
  await expect(pageB.locator('app-members-panel [data-url]')).toBeVisible();
  const invitePath = new URL((await pageB.locator('app-members-panel [data-url]').innerText()).trim()).pathname;
  await pageA.goto(invitePath);
  await pageA.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(pageA).toHaveURL(/\/cookbooks\/[0-9a-f-]{36}$/);

  // A adds a recipe to Stew and owns "Soups"
  await publishRecipe(pageA, { title: 'Ann soup', ingredients: ['water'], steps: ['Boil'] });
  await pageA.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Add to Stew' }).click();
  await expect(pageA.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await createCookbook(pageA, 'Soups');

  // the confirmation names Soups, not Stew
  await pageA.goto('/settings/delete');
  const owned = pageA.locator('[data-owned-cookbooks] li');
  await expect(owned).toHaveCount(1);
  await expect(owned.first()).toHaveText('Soups');

  await pageA.getByLabel('Password').fill(leaver.who.password);
  await pageA.getByRole('button', { name: 'Delete my account' }).click();
  await expect(pageA).toHaveURL(/\/login/);

  // B's cookbook survives without A as co-author or A's recipe
  await pageB.goto(stewPath);
  await expect(pageB.getByRole('heading', { name: 'Stew', level: 1 })).toBeVisible();
  await expect(pageB.locator('[data-member="author"]')).toHaveCount(0);
  await expect(pageB.getByText(leaver.who.displayName)).toHaveCount(0);
  await expect(pageB.locator('li.entry', { hasText: 'Ann soup' })).toHaveCount(0);
});
