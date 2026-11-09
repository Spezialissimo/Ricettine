import { Page, TestInfo, expect } from '@playwright/test';
import { apiPublishRecipe, createRecipe, expectCardLayout, expectSaved, logOut, newUserPage, test } from '../helpers';

const stamp = (testInfo: TestInfo) => `${testInfo.project.name}-${Date.now().toString(36)}`;

/** The feed has answered: the loading status is gone, so a negative assertion is meaningful. */
async function feedLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  await expect(page.locator('p.loading')).toHaveCount(0);
  await expect(page.locator('a.recipe').first().or(page.locator('p.empty'))).toBeVisible();
}

/** Creates a recipe through the editor, sets its visibility and optionally publishes it. Stays on the editor. */
async function editorRecipe(page: Page, title: string, visibility: 'Private' | 'Public', publish: boolean) {
  await createRecipe(page, { title, ingredients: ['salt'], steps: ['Cook'] });
  await page.getByRole('radio', { name: visibility }).check();
  await expectSaved(page);
  if (publish) {
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('[data-url]')).toBeVisible();
  }
  return page.url();
}

test('login lands on the feed, which lists only published public recipes and follows visibility', async ({ browser }, testInfo) => {
  const s = stamp(testInfo);
  const { page: a } = await newUserPage(browser, testInfo, 'feeda');
  const { page: b } = await newUserPage(browser, testInfo, 'feedb');

  await expect(b).toHaveURL(/\/$/);
  await expect(b.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  await expect(b).toHaveTitle('Home · Ricettine');

  const pubUrl = await editorRecipe(a, `Feed-pub-${s}`, 'Public', true);
  await editorRecipe(a, `Feed-priv-${s}`, 'Private', true);
  await editorRecipe(a, `Feed-draft-${s}`, 'Public', false);

  await b.goto('/');
  await expect(b.getByRole('link', { name: new RegExp(`Feed-pub-${s}`) })).toBeVisible();
  await feedLoaded(b);
  await expect(b.getByText(`Feed-priv-${s}`)).toHaveCount(0);
  await expect(b.getByText(`Feed-draft-${s}`)).toHaveCount(0);
  await b.getByRole('link', { name: new RegExp(`Feed-pub-${s}`) }).click();
  await expect(b).toHaveURL(/\/r\/[^/]+$/);
  await expect(b.getByRole('heading', { name: `Feed-pub-${s}`, level: 1 })).toBeVisible();

  // A switches it to private: the editor explains what that means, and it leaves the feed.
  await a.goto(pubUrl);
  await expect(a.getByText('Listed on the home feed and your profile once published.')).toBeVisible();
  const saved = a.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/recipes/'));
  await a.getByRole('radio', { name: 'Private' }).check();
  await saved;
  await expect(a.getByText(/Hidden from the home feed and your profile\./)).toBeVisible();

  await b.goto('/');
  await feedLoaded(b);
  await expect(b.getByText(`Feed-pub-${s}`)).toHaveCount(0);
});

test('the feed paginates: 20 first, then Load more shows the oldest', async ({ browser }, testInfo) => {
  const s = stamp(testInfo);
  const { page: b } = await newUserPage(browser, testInfo, 'feedpg');
  for (let i = 1; i <= 21; i++) {
    await apiPublishRecipe(b, { title: `Page-${s}-${String(i).padStart(2, '0')}`, visibility: 'PUBLIC' });
  }
  await b.goto('/');
  const cards = b.locator('a.recipe');
  await expect(cards).toHaveCount(20);
  await expect(b.getByText(`Page-${s}-21`)).toBeVisible();
  await expect(b.getByText(`Page-${s}-01`)).toHaveCount(0);
  await b.getByRole('button', { name: 'Load more' }).click();
  // the feed is shared with every other spec, so older recipes of theirs may follow ours
  const mine = cards.filter({ hasText: `Page-${s}-` });
  await expect(mine).toHaveCount(21);
  await expect(b.getByText(`Page-${s}-01`)).toBeVisible();
  const names = await mine.locator('.name').allInnerTexts();
  expect(new Set(names).size).toBe(names.length);
});

test('feed cards sit side by side on desktop and stack on mobile; logout works from the feed', async ({ browser }, testInfo) => {
  const s = stamp(testInfo);
  const { page } = await newUserPage(browser, testInfo, 'feedlay');
  await apiPublishRecipe(page, { title: `Lay-${s}-1`, visibility: 'PUBLIC' });
  await apiPublishRecipe(page, { title: `Lay-${s}-2`, visibility: 'PUBLIC' });
  await page.goto('/');
  const cards = page.locator('a.recipe');
  await expectCardLayout(cards, testInfo.project.name);
  await logOut(page);
});
