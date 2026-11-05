import { expect, test } from '@playwright/test';
import { newUserPage } from './helpers';

test('responsive shell: the right navigation shows for the viewport', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'shell');
  const main = page.getByRole('navigation', { name: 'Main' });
  const bottom = page.getByRole('navigation', { name: 'Sections' });
  if (testInfo.project.name === 'desktop') {
    await expect(main).toBeVisible();
    await expect(main.getByRole('link', { name: '+ New recipe' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(main.getByRole('link', { name: 'My recipes' })).not.toHaveAttribute('aria-current', 'page');
    await expect(main.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current', 'page');
    await expect(bottom).toBeHidden();
  } else {
    await expect(bottom).toBeVisible();
    await expect(bottom.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(main).toBeHidden();
    await expect(page.getByRole('link', { name: 'New recipe' })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await context.close();
});

test('a new recipe opens the editor route and is listed as a draft', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'draft');
  await page.getByRole('link', { name: 'My recipes' }).click();
  await expect(page.getByText('You have no recipes yet.')).toBeVisible();

  const newLink =
    testInfo.project.name === 'desktop'
      ? page.getByRole('link', { name: '+ New recipe' })
      : page.getByRole('link', { name: 'New recipe' });
  await newLink.click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const id = page.url().match(/\/recipes\/([0-9a-f-]{36})\/edit$/)![1];

  await page.getByRole('link', { name: 'My recipes' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  const item = page.locator(`a.recipe[href="/recipes/${id}/edit"]`);
  await expect(item).toBeVisible();
  await expect(item).toContainText('Untitled recipe');
  await expect(item).toContainText('Draft');
  await context.close();
});
