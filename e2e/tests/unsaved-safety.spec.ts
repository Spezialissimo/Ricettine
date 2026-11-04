import { join } from 'node:path';
import { Page, expect, test } from '@playwright/test';
import { createRecipe, logIn, newContext, newUserPage } from './helpers';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'portrait-orientation6.jpg');

const saved = (page: Page) => page.getByRole('status').getByText('Saved ✓');
const step1 = (page: Page) => page.getByRole('textbox', { name: 'Step 1' });

test('text typed offline saves when back online', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'offline');
  await createRecipe(page, { title: 'Offline soup', ingredients: ['water'], steps: ['Boil'] });

  await context.setOffline(true);
  await step1(page).fill('Boil gently for ten minutes');
  await expect(page.getByRole('status').getByText('Offline: will save when you reconnect')).toBeVisible();

  await context.setOffline(false);
  await expect(saved(page)).toBeVisible();
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
  await expect(saved(again)).toBeVisible();
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

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add cover photo' }).click();
  await (await chooser).setFiles(FIXTURE);

  await expect(page.getByText('Upload failed', { exact: true })).toBeVisible();
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  await expect(publish).toBeDisabled();

  await page.getByRole('button', { name: 'Retry cover photo upload' }).click();
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expect(saved(page)).toBeVisible();
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
  await expect(saved(page1)).toBeVisible();

  await step1(page2).fill('Text from device two');
  await expect(page2.getByLabel('Your unsaved text')).toHaveValue(/Text from device two/);

  await page2.getByRole('button', { name: 'Load latest' }).click();
  await expect(step1(page2)).toHaveValue('Text from device one');
  await ctx2.close();
});
