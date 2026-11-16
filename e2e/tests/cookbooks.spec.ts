import { expect } from '@playwright/test';
import { createCookbook, createRecipe, editCookbook, expectCardLayout, linkIn, newContext, newUserPage, openCookbookShare, publishRecipe, recipeAction, test } from '../helpers';

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

test('cookbooks: add own and others recipes, edit in place, remove entry, delete cookbook', async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const a = await newUserPage(browser, testInfo, 'cbA');
  const b = await newUserPage(browser, testInfo, 'cbB');
  const pageA = a.page;

  const view = await createCookbook(pageA, 'Desserts'); // the one view, /c/:token
  await publishRecipe(pageA, { title: 'Tiramisù', ingredients: ['mascarpone'], steps: ['Layer'] });

  // from the editor
  await pageA.getByRole('button', { name: 'Add to cookbook', exact: true }).click();
  const dialog = pageA.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(dialog.getByText('Added', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // My kitchen's card opens the cookbook's one view (its share link)
  await pageA.goto('/cookbooks');
  await pageA.getByRole('link', { name: /Desserts/ }).click();
  await expect(pageA).toHaveURL(view);
  const tiramisuCard = pageA.locator('.recipe-card', { hasText: 'Tiramisù' });
  await expect(tiramisuCard).toContainText(`by ${a.who.displayName}`);
  await expect(pageA.locator('app-cookbook-hero')).toContainText('1 recipe');

  // someone else's private recipe, through its link (desktop: the header buttons; phone: the ⋯ menu)
  const panna = await publishRecipe(b.page, { title: 'Panna cotta', ingredients: ['cream'], steps: ['Set'] });
  await pageA.goto(new URL(panna.shareUrl).pathname);
  await expect(pageA.getByRole('heading', { name: 'Panna cotta' })).toBeVisible();
  await recipeAction(pageA, 'Add to cookbook', project);
  await pageA.getByRole('dialog').getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(pageA.getByRole('dialog').getByText('Added', { exact: true })).toBeVisible();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // again: already in
  await recipeAction(pageA, 'Add to cookbook', project);
  await pageA.getByRole('dialog').getByRole('button', { name: 'Add to Desserts' }).click();
  await expect(pageA.getByRole('dialog').getByText('Already in this cookbook')).toBeVisible();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // the view: every card opens the recipe through the cookbook link
  await pageA.goto(view);
  const pannaCard = pageA.locator('.recipe-card', { hasText: 'Panna cotta' });
  await expect(pannaCard).toContainText(b.who.displayName);
  await expect(pannaCard).toHaveAttribute('href', /\/c\/[A-Za-z0-9_-]+\/r\/[0-9a-f-]{36}$/);
  await expect(tiramisuCard).toHaveAttribute('href', /\/c\/[A-Za-z0-9_-]+\/r\/[0-9a-f-]{36}$/);

  // edit: who added what, and no per-recipe Edit (the editor opens only from a recipe page's Edit)
  await editCookbook(pageA);
  const tiramisuRow = pageA.locator('li.entry', { hasText: 'Tiramisù' });
  await expect(tiramisuRow).toContainText(`Added by ${a.who.displayName}`);
  await expect(pageA.locator('li.entry').getByRole('link', { name: /^Edit/ })).toHaveCount(0);

  // name, description and visibility are edited in place; Save stores them and returns to the view
  await expect(pageA.getByLabel('Name')).toHaveValue('Desserts');
  await pageA.getByLabel('Name').fill('');
  await pageA.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pageA.locator('#cb-name-err')).toBeVisible(); // required: stays on the edit page
  await expect(pageA).toHaveURL(/\/edit$/);
  await pageA.getByLabel('Name').fill('Sweet things');
  await pageA.getByLabel('Description').fill('After dinner.');
  await pageA.getByRole('radio', { name: 'Public' }).check();
  await pageA.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pageA).toHaveURL(view);
  await expect(pageA.getByRole('heading', { name: 'Sweet things', level: 1 })).toBeVisible();
  await expect(pageA.getByText('After dinner.')).toBeVisible();
  await editCookbook(pageA);
  await expect(pageA.getByRole('radio', { name: 'Public' })).toBeChecked();
  await pageA.goto('/cookbooks');
  await expect(pageA.getByRole('link', { name: /Sweet things/ })).toBeVisible();
  await expect(pageA.getByRole('link', { name: /Desserts/ })).toHaveCount(0);

  // remove an entry (edit page); the recipe itself is untouched
  await pageA.goto(view);
  await editCookbook(pageA);
  await pageA.getByRole('button', { name: 'Remove Panna cotta' }).click();
  await expect(pageA.locator('li.entry', { hasText: 'Panna cotta' })).toHaveCount(0);
  await pageA.goto(new URL(panna.shareUrl).pathname);
  await expect(pageA.getByRole('heading', { name: 'Panna cotta' })).toBeVisible();

  // delete the cookbook (edit page); recipes stay
  await pageA.goto(view);
  await editCookbook(pageA);
  await pageA.getByRole('button', { name: 'Delete cookbook' }).click();
  await expect(pageA.getByRole('dialog')).toContainText('Sweet things');
  await pageA.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(pageA).toHaveURL(/\/kitchen\/cookbooks$/);
  await expect(pageA.getByRole('link', { name: /Sweet things/ })).toHaveCount(0);
  await pageA.goto('/kitchen/recipes');
  await expect(pageA.getByRole('link', { name: /Tiramisù/ })).toBeVisible();
});

test('a cookbook has one view for everyone: share link, Share sheet, Edit only for members', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'cbone');
  const view = await createCookbook(page, 'One view');
  // the member address forwards to the share link
  await page.goto('/cookbooks');
  await page.getByRole('link', { name: /One view/ }).click();
  await expect(page).toHaveURL(view);
  const sheet = await openCookbookShare(page);
  expect(new URL(await linkIn(sheet)).pathname).toBe(view);
  await expect(sheet.getByRole('button', { name: 'Reset link' })).toBeVisible(); // the owner
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();

  // a reader without an account: the same page, Share without Reset, no Edit
  const anon = await newContext(browser, testInfo);
  const reader = await anon.newPage();
  await reader.goto(view);
  await expect(reader.getByRole('heading', { name: 'One view', level: 1 })).toBeVisible();
  await expect(reader.locator('app-cookbook-hero').getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  const readerSheet = await openCookbookShare(reader);
  await expect(readerSheet.getByRole('button', { name: 'Reset link' })).toHaveCount(0);
});

test('a draft cannot be added to a cookbook: the editor has no share section until it is published', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'cbdraft');
  await createRecipe(page, { title: 'Half done' });
  await expect(page.getByRole('heading', { name: 'Share' })).toHaveCount(0);
  await expect(page.getByText('Publish the recipe to add it to a cookbook.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to cookbook', exact: true })).toHaveCount(0);
});
