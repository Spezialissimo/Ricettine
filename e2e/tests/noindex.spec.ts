import { expect } from '@playwright/test';
import { apiPublishRecipe, createCookbook, newUserPage, test } from '../helpers';

const NOINDEX = 'noindex, nofollow';

test('recipe and cookbook pages tell crawlers not to index (header and meta)', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'noidx');
  const { shareToken } = await apiPublishRecipe(page, { title: 'Noindex soup', visibility: 'PUBLIC' });
  await createCookbook(page, 'Noindex book');
  const cookbookToken = (await page.locator('[data-url]').innerText()).trim().split('/').pop()!;

  for (const path of [`/r/${shareToken}`, `/c/${cookbookToken}`]) {
    const response = await page.goto(path);
    expect(response!.headers()['x-robots-tag']).toBe(NOINDEX);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', NOINDEX);
  }
});
