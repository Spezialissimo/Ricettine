import { Page, expect } from '@playwright/test';
import { createRecipe, expectSaved, logIn, newContext, newUserPage, test, pickPhoto } from '../helpers';

const step1 = (page: Page) => page.getByRole('textbox', { name: 'Step 1' });

test('text typed offline saves when back online', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'offline');
  await createRecipe(page, { title: 'Offline soup', ingredients: ['water'], steps: ['Boil'] });

  await context.setOffline(true);
  await step1(page).fill('Boil gently for ten minutes');
  await expect(page.getByRole('status').getByText('Offline: will save when you reconnect')).toBeVisible();

  await context.setOffline(false);
  await expectSaved(page);
  await page.reload();
  await expect(step1(page)).toHaveValue('Boil gently for ten minutes');
});

test('unsaved text survives closing the tab', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'closetab');
  const editorUrl = await createRecipe(page, { title: 'Closed stew', ingredients: ['beans'], steps: ['Soak'] });

  // This tab's saves fail as if offline. Not context.setOffline: going back online fires 'online' in a
  // tab still being torn down, its editor retries at once, and Playwright lets a request from a page it
  // already counts as closed through unrouted, so the text could reach the server before the reopen.
  await page.route('**/api/recipes/*', (route) =>
    route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue(),
  );
  await step1(page).fill('Soak overnight, then simmer');
  await expect(page.getByRole('status').getByText('Offline: will save when you reconnect')).toBeVisible();
  await page.close();

  const id = editorUrl.match(/\/recipes\/([0-9a-f-]{36})\/edit$/)![1];
  const serverStep = async () => (await (await context.request.get(`/api/recipes/${id}`)).json()).steps[0].text;
  // The server never got the text: only the local backup has it.
  expect(await serverStep()).toBe('Soak');
  const again = await context.newPage();
  await again.goto(editorUrl);
  await expect(step1(again)).toHaveValue('Soak overnight, then simmer');
  // So this tab restored it from the backup, and must save it.
  await expectSaved(again);
  await expect.poll(serverStep).toBe('Soak overnight, then simmer');
  await again.reload();
  await expect(step1(again)).toHaveValue('Soak overnight, then simmer');
});

test('failed upload can be retried', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'retry');
  await createRecipe(page, { title: 'Retry tart', ingredients: ['flour'], steps: ['Bake'] });

  let failed = false;
  await page.route('**/photos', async (route) => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await pickPhoto(page, page.getByRole('button', { name: 'Add cover photo' }));

  await expect(page.getByText('Upload failed', { exact: true })).toBeVisible();
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  await expect(publish).toBeDisabled();

  await page.getByRole('button', { name: 'Retry cover photo upload' }).click();
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
  await expect(publish).toBeEnabled();
  expect(failed).toBe(true);
});

test('conflict keeps my text', async ({ browser }, testInfo) => {
  const { who, page: page1 } = await newUserPage(browser, testInfo, 'conflict');
  const editorUrl = await createRecipe(page1, { title: 'Two devices', ingredients: ['salt'], steps: ['Original step'] });

  // the same user on a second device, opened while the recipe is still at its first version
  const ctx2 = await newContext(browser, testInfo);
  const page2 = await ctx2.newPage();
  await page2.goto('/login');
  await logIn(page2, who);
  await page2.goto(editorUrl);
  await expect(step1(page2)).toHaveValue('Original step');

  await step1(page1).fill('Text from device one');
  await expectSaved(page1);

  await step1(page2).fill('Text from device two');
  await expect(page2.getByLabel('Your unsaved text')).toHaveValue(/Text from device two/);

  await page2.getByRole('button', { name: 'Load latest' }).click();
  await expect(step1(page2)).toHaveValue('Text from device one');
});

test('conflict block includes an ingredient-only edit', async ({ browser }, testInfo) => {
  const { who, page: page1 } = await newUserPage(browser, testInfo, 'conflict-ing');
  const editorUrl = await createRecipe(page1, { title: 'Ingredient race', ingredients: ['salt'], steps: ['Original step'] });

  const ctx2 = await newContext(browser, testInfo);
  const page2 = await ctx2.newPage();
  await page2.goto('/login');
  await logIn(page2, who);
  await page2.goto(editorUrl);
  await expect(step1(page2)).toHaveValue('Original step');

  await step1(page1).fill('Changed on device one');
  await expectSaved(page1);

  await page2.getByRole('button', { name: '+ Ingredient' }).last().click();
  await expect(page2.getByLabel('Ingredient', { exact: true })).toHaveCount(2); // the new row exists before `.nth(1)` is used
  await page2.getByLabel('Ingredient', { exact: true }).nth(1).fill('butter');
  await page2.getByLabel('Amount', { exact: true }).nth(1).fill('300');
  await page2.getByLabel('Unit', { exact: true }).nth(1).selectOption('g');
  await expect(page2.getByLabel('Your unsaved text')).toHaveValue(/salt[\s\S]*300 g butter/);
});

test('a failed logout keeps the user signed in and shows an error', async ({ browser }, testInfo) => {
  const { page, who } = await newUserPage(browser, testInfo, 'logout-fail');
  await page.route('**/api/auth/logout', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cannot reach the server' })).toBeVisible();
  await expect(page.getByRole('banner').getByText(who.displayName, { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.reload();
  await expect(page.getByRole('banner').getByText(who.displayName, { exact: true })).toBeVisible();
});
