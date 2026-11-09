import { expect } from '@playwright/test';
import { createCookbook, createRecipe, expectCardLayout, newUserPage, publishRecipe, test } from '../helpers';

test('my cookbooks: items sit side by side on desktop and stack on the phone', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'cblayout');
  await createCookbook(page, 'First book');
  await createCookbook(page, 'Second book');
  await page.goto('/cookbooks');
  const items = page.locator('a.cookbook');
  await expect(items).toHaveCount(2);
  await expectCardLayout(items, testInfo.project.name);
  await expect(items.first()).toContainText('Owner');
  await expect(items.first()).toContainText('Private');
});

test('cookbooks: add own and others recipes, rename, remove entry, delete cookbook', async ({ browser }, testInfo) => {
  const a = await newUserPage(browser, testInfo, 'cbA');
  const b = await newUserPage(browser, testInfo, 'cbB');
  const pageA = a.page;

  await createCookbook(pageA, 'Desserts');
  await publishRecipe(pageA, { title: 'Tiramisù', ingredients: ['mascarpone'], steps: ['Layer'] });

  // from the editor
  await pageA.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  const dialog = pageA.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(dialog.getByText('Added', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await pageA.goto('/cookbooks');
  await pageA.getByRole('link', { name: /Desserts/ }).click();
  const tiramisuRow = pageA.locator('li.entry', { hasText: 'Tiramisù' });
  await expect(tiramisuRow).toContainText(`Added by ${a.who.displayName}`);

  // someone else's private recipe, through its link
  const panna = await publishRecipe(b.page, { title: 'Panna cotta', ingredients: ['cream'], steps: ['Set'] });
  await pageA.goto(new URL(panna.shareUrl).pathname);
  await expect(pageA.getByRole('heading', { name: 'Panna cotta' })).toBeVisible();
  await pageA.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(pageA.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // again: already in
  await pageA.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(pageA.getByRole('dialog').getByText('Already in this cookbook')).toBeVisible();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await pageA.goto('/cookbooks');
  await pageA.getByRole('link', { name: /Desserts/ }).click();
  const pannaRow = pageA.locator('li.entry', { hasText: 'Panna cotta' });
  await expect(pannaRow).toBeVisible();
  await expect(pannaRow).toContainText(b.who.displayName);
  // everyone's titles open the recipe through the cookbook link; only my own recipes also offer Edit
  await expect(pannaRow.getByRole('link', { name: 'Panna cotta' })).toHaveAttribute('href', /\/c\/[A-Za-z0-9_-]+\/r\/[0-9a-f-]{36}$/);
  await expect(pannaRow.getByRole('link', { name: /^Edit/ })).toHaveCount(0);
  await expect(tiramisuRow.getByRole('link', { name: 'Edit Tiramisù' })).toHaveAttribute('href', /\/recipes\/[0-9a-f-]{36}\/edit$/);

  // rename
  await pageA.getByRole('button', { name: 'Edit', exact: true }).click();
  await pageA.getByRole('dialog').getByLabel('Name').fill('Sweet things');
  await pageA.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pageA.getByRole('heading', { name: 'Sweet things', level: 1 })).toBeVisible();
  await pageA.goto('/cookbooks');
  await expect(pageA.getByRole('link', { name: /Sweet things/ })).toBeVisible();
  await expect(pageA.getByRole('link', { name: /Desserts/ })).toHaveCount(0);

  // remove an entry; the recipe itself is untouched
  await pageA.getByRole('link', { name: /Sweet things/ }).click();
  await pageA.getByRole('button', { name: 'Remove Panna cotta' }).click();
  await expect(pageA.locator('li.entry', { hasText: 'Panna cotta' })).toHaveCount(0);
  await pageA.goto(new URL(panna.shareUrl).pathname);
  await expect(pageA.getByRole('heading', { name: 'Panna cotta' })).toBeVisible();

  // delete the cookbook; recipes stay
  await pageA.goto('/cookbooks');
  await pageA.getByRole('link', { name: /Sweet things/ }).click();
  await pageA.getByRole('button', { name: 'Delete cookbook' }).click();
  await expect(pageA.getByRole('dialog')).toContainText('Sweet things');
  await pageA.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(pageA).toHaveURL(/\/cookbooks$/);
  await expect(pageA.getByRole('link', { name: /Sweet things/ })).toHaveCount(0);
  await pageA.goto('/recipes');
  await expect(pageA.getByRole('link', { name: /Tiramisù/ })).toBeVisible();
});

test('a draft cannot be added to a cookbook: the editor says to publish first', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'cbdraft');
  await createRecipe(page, { title: 'Half done' });
  await expect(page.getByText('Publish the recipe to add it to a cookbook.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cookbook', exact: true })).toHaveCount(0);
});
