import { expect, test } from '@playwright/test';
import { createCookbook, logOut, newUserPage, publishRecipe } from './helpers';

test('co-authors: invite, accept, add, reuse, remove with recipes, rejoin and leave keeping them', async ({ browser }, testInfo) => {
  const a = await newUserPage(browser, testInfo, 'coA');
  const b = await newUserPage(browser, testInfo, 'coB');
  const c = await newUserPage(browser, testInfo, 'coC');
  const pageA = a.page;
  const pageB = b.page;

  await createCookbook(pageA, 'Weeknight');
  const cookbookPath = new URL(pageA.url()).pathname;
  await pageA.getByRole('button', { name: 'Invite co-author' }).click();
  await expect(pageA.locator('app-members-panel [data-url]')).toBeVisible();
  const invitePath = new URL((await pageA.locator('app-members-panel [data-url]').innerText()).trim()).pathname;
  expect(invitePath).toContain('/cookbook-invite/');

  // B is logged out: the invite goes through the login and comes back
  await logOut(pageB);
  await pageB.goto(invitePath);
  await expect(pageB).toHaveURL(/\/login\?next=/);
  await pageB.getByLabel('Email', { exact: true }).fill(b.who.email);
  await pageB.getByLabel('Password').fill(b.who.password);
  await pageB.getByRole('button', { name: 'Log in' }).click();
  await expect(pageB).toHaveURL(/\/cookbook-invite\//);
  await expect(pageB.getByText('Weeknight')).toBeVisible();
  await pageB.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(pageB).toHaveURL(/\/cookbooks\/[0-9a-f-]{36}$/);
  await expect(pageB.getByRole('heading', { name: 'Weeknight', level: 1 })).toBeVisible();
  await expect(pageB.locator('.badges').getByText('Co-author')).toBeVisible();
  await expect(pageB.getByRole('button', { name: 'Leave cookbook' })).toBeVisible();
  await expect(pageB.getByRole('button', { name: 'Invite co-author' })).toHaveCount(0);

  // B adds a recipe of their own; A sees who added it
  await publishRecipe(pageB, { title: 'Bob soup', ingredients: ['water'], steps: ['Boil'] });
  await pageB.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await pageB.getByRole('dialog').getByRole('button', { name: 'Add to Weeknight' }).click();
  await expect(pageB.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await pageB.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await pageA.goto(cookbookPath);
  await expect(pageA.locator('li.entry', { hasText: 'Bob soup' })).toContainText(`Added by ${b.who.displayName}`);

  // the invite is single use
  await c.page.goto(invitePath);
  await expect(c.page.getByRole('alert')).toContainText('invalid');
  await expect(c.page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);

  // A removes B with the checkbox ticked
  await pageA.getByRole('button', { name: `Remove ${b.who.displayName}` }).click();
  const dialog = pageA.getByRole('dialog');
  await dialog.getByLabel('Also remove the recipes they added').check();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(pageA.locator('li.entry', { hasText: 'Bob soup' })).toHaveCount(0);
  await expect(pageA.locator('[data-member="author"]')).toHaveCount(0);
  await pageB.goto('/cookbooks');
  await expect(pageB.getByRole('heading', { name: 'Cookbooks' })).toBeVisible();
  await expect(pageB.getByText('You have no cookbooks yet.')).toBeVisible();
  await pageB.goto('/recipes');
  await expect(pageB.getByText('Bob soup')).toBeVisible();

  // second round: invite again, B adds and leaves without ticking the box
  await pageA.getByRole('button', { name: 'Invite co-author' }).click();
  await expect(pageA.locator('app-members-panel [data-url]')).toBeVisible();
  const invite2 = new URL((await pageA.locator('app-members-panel [data-url]').innerText()).trim()).pathname;
  await pageB.goto(invite2);
  await pageB.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(pageB).toHaveURL(/\/cookbooks\/[0-9a-f-]{36}$/);
  await pageB.goto('/recipes');
  await pageB.getByText('Bob soup').click();
  await pageB.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await pageB.getByRole('dialog').getByRole('button', { name: 'Add to Weeknight' }).click();
  await expect(pageB.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await pageB.goto(cookbookPath);
  await pageB.getByRole('button', { name: 'Leave cookbook' }).click();
  const leave = pageB.getByRole('dialog');
  await expect(leave.getByLabel('Also remove the recipes I added')).not.toBeChecked();
  await leave.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(pageB).toHaveURL(/\/cookbooks$/);
  await pageA.goto(cookbookPath);
  await expect(pageA.locator('li.entry', { hasText: 'Bob soup' })).toBeVisible();
  await expect(pageA.locator('[data-member="author"]')).toHaveCount(0);
});
