import { expect } from '@playwright/test';
import { ADMIN, accountMenuLink, apiPublishRecipe, expectCardLayout, logIn, navTo, newContext, newUserPage, test } from '../helpers';

test('My kitchen: Overview shows a few recipes and cookbooks, Show more and the tabs switch', async ({ browser }, testInfo) => {
  const s = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const { page } = await newUserPage(browser, testInfo, 'kitchen');
  for (let i = 1; i <= 5; i++)
    await apiPublishRecipe(page, {
      title: `Kit-${s}-${i}`,
      visibility: 'PRIVATE',
    });

  await navTo(page, 'My kitchen', testInfo.project.name);
  await expect(page).toHaveURL(/\/kitchen$/);
  await expect(page.getByRole('heading', { name: 'My kitchen', level: 1 })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'My kitchen sections' });
  await expect(tabs.getByRole('link')).toHaveText(['Overview', 'Recipes', 'Cookbooks']);
  await expect(tabs.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

  // Overview: the four most recently edited recipes; no cookbooks yet
  const recipes = page.getByRole('region', { name: 'Recipes' });
  await expect(recipes.locator('a.recipe')).toHaveCount(4);
  await expect(recipes.locator('a.recipe').first()).toContainText(`Kit-${s}-5`);
  // a card opens the recipe page (a published one forwards to its share link), never the editor
  await expect(recipes.locator('a.recipe').first()).toHaveAttribute('href', /\/recipes\/[0-9a-f-]{36}\/view$/);
  await expectCardLayout(recipes.locator('a.recipe'), testInfo.project.name);
  const cookbooks = page.getByRole('region', { name: 'Cookbooks' });
  await expect(cookbooks.getByText('You have no cookbooks yet.')).toBeVisible();
  await expect(cookbooks.getByRole('link', { name: 'Show more cookbooks' })).toHaveCount(0);

  // Show more goes to the Recipes tab, which lists all five
  await recipes.getByRole('link', { name: 'Show more recipes' }).click();
  await expect(page).toHaveURL(/\/kitchen\/recipes$/);
  await expect(tabs.getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('a.recipe')).toHaveCount(5);

  // a cookbook created from the Overview shows up there and in the Cookbooks tab
  await tabs.getByRole('link', { name: 'Overview' }).click();
  await cookbooks.getByRole('button', { name: 'Create your first cookbook' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(`Kit-book-${s}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]+$/); // /cookbooks/:id forwards to the cookbook's one view
  await page.goBack();
  await expect(page).toHaveURL(/\/kitchen$/);
  await expect(cookbooks.locator('a.cookbook')).toHaveText([new RegExp(`Kit-book-${s}`)]);
  await cookbooks.getByRole('link', { name: 'Show more cookbooks' }).click();
  await expect(page).toHaveURL(/\/kitchen\/cookbooks$/);
  await expect(page.locator('a.cookbook', { hasText: `Kit-book-${s}` })).toBeVisible();

  // the browser Back button walks the tabs
  await page.goBack();
  await expect(page).toHaveURL(/\/kitchen$/);
});

test('old /recipes and /cookbooks URLs open the matching My kitchen tab', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'kitold');
  await page.goto('/recipes');
  await expect(page).toHaveURL(/\/kitchen\/recipes$/);
  await page.goto('/cookbooks');
  await expect(page).toHaveURL(/\/kitchen\/cookbooks$/);
  await expect(page.getByRole('button', { name: 'Create your first cookbook' })).toBeVisible();
});

test('empty My kitchen: each message sits above its action, and the actions look the same', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'kitempty');
  await page.goto('/kitchen');
  const recipeText = page.getByText('You have no recipes yet.');
  const recipeAction = page.getByRole('link', {
    name: 'Create your first recipe',
  });
  const bookText = page.getByText('You have no cookbooks yet.');
  const bookAction = page.getByRole('button', {
    name: 'Create your first cookbook',
  });
  for (const [text, action] of [
    [recipeText, recipeAction],
    [bookText, bookAction],
  ] as const) {
    const t = (await text.boundingBox())!;
    const a = (await action.boundingBox())!;
    expect(a.y).toBeGreaterThan(t.y + t.height - 1);
    expect(Math.abs(a.x - t.x)).toBeLessThan(2);
  }
  for (const prop of ['background-color', 'color', 'font-weight', 'border-radius', 'height']) {
    expect(await bookAction.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop), prop).toBe(
      await recipeAction.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop),
    );
  }

  // the two tabs follow the same order: message first, action below
  for (const [tab, text, action] of [
    ['Recipes', recipeText, recipeAction],
    ['Cookbooks', bookText, bookAction],
  ] as const) {
    await page.getByRole('navigation', { name: 'My kitchen sections' }).getByRole('link', { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`/kitchen/${tab.toLowerCase()}$`));
    await expect(text).toBeVisible();
    await expect(action).toBeVisible();
    const t = (await text.boundingBox())!;
    const a = (await action.boundingBox())!;
    expect(a.y, tab).toBeGreaterThan(t.y + t.height - 1);
  }
});

test('Settings: one grouped navigation; Invites and Users sit under Administration for admins', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'settabs');
  await accountMenuLink(page, 'Settings');
  await expect(page).toHaveURL(/\/settings\/profile$/);
  const nav = page.getByRole('navigation', { name: 'Settings' });
  await expect(nav.getByRole('group')).toHaveCount(1);
  await expect(nav.getByRole('group', { name: 'Account' }).getByRole('link')).toHaveText(['Profile', 'Appearance', 'Language', 'Password', 'Delete account']);
  await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Password' }).click();
  await expect(page).toHaveURL(/\/settings\/password$/);
  await expect(page.getByRole('heading', { name: 'Change password', level: 1 })).toBeVisible();
  for (const link of await nav.getByRole('link').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // desktop: a sidebar left of the page; phone: the links sit above it
  const navBox = (await nav.boundingBox())!;
  const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  // the group title reads as a title, not as one more link: bolder and in a different colour
  const title = nav.getByText('Account', { exact: true });
  const link = nav.getByRole('link', { name: 'Delete account' });
  const style = (l: typeof link, p: string) => l.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), p);
  expect(Number(await style(title, 'font-weight'))).toBeGreaterThanOrEqual(700);
  expect(Number(await style(link, 'font-weight'))).toBeLessThan(700);
  // desktop links are muted text, so the title differs in colour too (on the phone the links are pill buttons)
  if (testInfo.project.name === 'desktop') expect(await style(title, 'color')).not.toBe(await style(link, 'color'));
  expect(await style(title, 'text-transform')).toBe('uppercase');
  // a line separates the menu from the page: vertical on desktop, horizontal on the phone
  const content = page.locator('app-settings-layout .content');
  if (testInfo.project.name === 'desktop') {
    expect(heading.x).toBeGreaterThan(navBox.x + navBox.width);
    await expect(content).toHaveCSS('border-left-style', 'solid');
  } else {
    expect(heading.y).toBeGreaterThan(navBox.y + navBox.height);
    await expect(nav).toHaveCSS('border-bottom-style', 'solid');
  }

  const ctx = await newContext(browser, testInfo);
  const admin = await ctx.newPage();
  await admin.goto('/login');
  await logIn(admin, ADMIN);
  await accountMenuLink(admin, 'Admin');
  await expect(admin).toHaveURL(/\/settings\/admin\/invites$/);
  const adminNav = admin.getByRole('navigation', { name: 'Settings' });
  const group = adminNav.getByRole('group', { name: 'Administration' });
  await expect(group.getByRole('link')).toHaveText(['Invites', 'Users']);
  await expect(group.getByRole('link', { name: 'Invites' })).toHaveAttribute('aria-current', 'page');
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Invites');
  await expect(
    admin.getByText('Invite links work once and expire after 7 days.', {
      exact: false,
    }),
  ).toBeVisible();
  await group.getByRole('link', { name: 'Users' }).click();
  await expect(admin).toHaveURL(/\/settings\/admin\/users$/);
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Users');
  await admin.goto('/admin');
  await expect(admin).toHaveURL(/\/settings\/admin\/invites$/);
});

test('a My kitchen recipe card opens the recipe: a published one at its share link, a draft with the draft banner', async ({ browser }, testInfo) => {
  const s = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const { page } = await newUserPage(browser, testInfo, 'kitopen');
  const { shareToken } = await apiPublishRecipe(page, { title: `Open-pub-${s}`, visibility: 'PRIVATE' });
  await page.goto('/kitchen/recipes');
  await page.locator('a.recipe', { hasText: `Open-pub-${s}` }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${shareToken}$`)); // one address per content
  await expect(page.getByRole('heading', { name: `Open-pub-${s}`, level: 1 })).toBeVisible();

  // a saved draft opens /recipes/:id/view with a banner and Publish
  await page.goto('/recipes/new');
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel('Title').fill(`Open-draft-${s}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/view$/);
  const banner = page.locator('.preview-banner.draft');
  await expect(banner.getByText('Draft: only you can see this recipe.')).toBeVisible();
  // incomplete (no ingredient, no step): Publish explains instead of failing silently
  await banner.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(banner.getByRole('alert')).toContainText('Use Edit to finish it.');
  await expect(page).toHaveURL(/\/view$/);
});

