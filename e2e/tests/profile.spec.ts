import { Page, TestInfo, expect } from '@playwright/test';
import { apiPublishRecipe, createCookbook, createRecipe, expectCardLayout, expectSaved, newUserPage, test } from '../helpers';

const stamp = (testInfo: TestInfo) => `${testInfo.project.name}-${Date.now().toString(36)}`;

/** The profile has answered: the Recipes section is rendered and the loading status is gone. */
async function profileLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: 'Recipes', level: 2 })).toBeVisible();
  await expect(page.locator('p.loading')).toHaveCount(0);
}

/** Sets a cookbook's visibility through its Edit dialog (the page must be the cookbook's own page). */
async function setCookbookVisibility(page: Page, visibility: 'Private' | 'Public') {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: visibility }).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.badge', { hasText: visibility })).toBeVisible();
}

test('a profile lists only public items to others, everything to its owner, and follows visibility', async ({ browser }, testInfo) => {
  const s = stamp(testInfo);
  const { page: a, who: whoA } = await newUserPage(browser, testInfo, 'profa');
  const { page: b } = await newUserPage(browser, testInfo, 'profb');

  // A: PUBLIC published (UI), PRIVATE published (API), a draft (UI), a PUBLIC and a PRIVATE cookbook (UI)
  await createRecipe(a, { title: `Prof-pub-${s}`, ingredients: ['salt'], steps: ['Cook'] });
  await a.getByRole('radio', { name: 'Public' }).check();
  await expectSaved(a);
  await a.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(a.locator('[data-url]')).toBeVisible();
  await apiPublishRecipe(a, { title: `Prof-priv-${s}`, visibility: 'PRIVATE' });
  await createRecipe(a, { title: `Prof-draft-${s}` });
  await createCookbook(a, `Prof-book-pub-${s}`);
  await setCookbookVisibility(a, 'Public');
  await createCookbook(a, `Prof-book-priv-${s}`);

  // B reaches A's profile from A's name on the feed
  await b.goto('/');
  await b.getByRole('link', { name: `by ${whoA.displayName}` }).first().click();
  await expect(b).toHaveURL(new RegExp(`/u/${whoA.username}$`));
  await expect(b).toHaveTitle(new RegExp(`${whoA.displayName} · Ricettine`));
  await expect(b.getByRole('heading', { name: whoA.displayName, level: 1 })).toBeVisible();
  await expect(b.getByText(`@${whoA.username}`)).toBeVisible();
  await profileLoaded(b);
  await expect(b.getByRole('link', { name: new RegExp(`Prof-pub-${s}`) })).toBeVisible();
  await expect(b.getByRole('link', { name: new RegExp(`Prof-book-pub-${s}`) })).toBeVisible();
  await expect(b.getByText(`Prof-priv-${s}`)).toHaveCount(0);
  await expect(b.getByText(`Prof-draft-${s}`)).toHaveCount(0);
  await expect(b.getByText(`Prof-book-priv-${s}`)).toHaveCount(0);
  await expect(b.locator('.badge')).toHaveCount(0);

  await b.getByRole('link', { name: new RegExp(`Prof-book-pub-${s}`) }).click();
  await expect(b).toHaveURL(/\/c\/[^/]+$/);
  await expect(b.getByRole('heading', { name: `Prof-book-pub-${s}`, level: 1 })).toBeVisible();

  // A opens their own profile from the shell and sees all five, marked
  await a.goto('/');
  await a.getByRole('banner').getByRole('link', { name: 'Your profile' }).click();
  await expect(a).toHaveURL(new RegExp(`/u/${whoA.username}$`));
  await profileLoaded(a);
  const card = (text: string) => a.locator('a.recipe', { hasText: `${text}-${s}` });
  await expect(card('Prof-pub').locator('.badge')).toHaveText('Public');
  await expect(card('Prof-priv').locator('.badge')).toHaveText('Private');
  await expect(card('Prof-draft').locator('.badge')).toHaveText('Draft');
  await expect(card('Prof-book-pub').locator('.badge')).toHaveText('Public');
  await expect(card('Prof-book-priv').locator('.badge')).toHaveText('Private');
  await card('Prof-draft').click();
  await expect(a).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);

  // A makes the public cookbook private: B's next load no longer lists it
  await a.goto(`/u/${whoA.username}`);
  await card('Prof-book-pub').click();
  await expect(a).toHaveURL(/\/cookbooks\/[0-9a-f-]{36}$/);
  await setCookbookVisibility(a, 'Private');
  await b.goto(`/u/${whoA.username}`);
  await profileLoaded(b);
  await expect(b.getByRole('link', { name: new RegExp(`Prof-pub-${s}`) })).toBeVisible();
  await expect(b.getByText(`Prof-book-pub-${s}`)).toHaveCount(0);

});

test('an unknown username shows the not-found state', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'profnf');
  await page.goto(`/u/nobody_${Date.now().toString(36)}`);
  await expect(page.getByRole('heading', { name: 'This person is not here' })).toBeVisible();
});

test('profile cards sit side by side on desktop and stack on mobile', async ({ browser }, testInfo) => {
  const s = stamp(testInfo);
  const { page, who } = await newUserPage(browser, testInfo, 'proflay');
  await apiPublishRecipe(page, { title: `PLay-${s}-1`, visibility: 'PUBLIC' });
  await apiPublishRecipe(page, { title: `PLay-${s}-2`, visibility: 'PUBLIC' });
  await page.goto(`/u/${who.username}`);
  const cards = page.locator('a.recipe');
  await expectCardLayout(cards, testInfo.project.name);
});
