import { expect } from '@playwright/test';
import { clickNewRecipe, navTo, newUserPage, openAccountMenu, openDrawer, test } from '../helpers';

test('responsive shell: Discover and My kitchen, the new-recipe action, and the account menu', async ({ browser }, testInfo) => {
  const { page, who } = await newUserPage(browser, testInfo, 'shell');
  const main = page.getByRole('navigation', { name: 'Main' });
  const banner = page.getByRole('banner');
  const burger = banner.getByRole('button', { name: 'Menu' });
  // no bottom bar on either layout
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  if (testInfo.project.name === 'desktop') {
    await expect(main).toBeVisible();
    await expect(burger).toBeHidden();
    await expect(main.getByRole('link')).toHaveText(['Discover', 'My kitchen']);
    await expect(main.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
    // the bar is taller, and the pill sits right of the nav links, before the account menu
    expect((await banner.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    const pill = (await banner.getByRole('link', { name: '+ New recipe' }).boundingBox())!;
    const lastLink = (await main.getByRole('link', { name: 'My kitchen' }).boundingBox())!;
    const account = (await banner.locator('app-account-menu button.trigger').boundingBox())!;
    expect(pill.height).toBeGreaterThanOrEqual(44);
    expect(pill.x).toBeGreaterThan(lastLink.x + lastLink.width);
    expect(account.x).toBeGreaterThan(pill.x + pill.width - 1);
  } else {
    // phone: ☰ before the logo opens a panel from the left; no "+" in the bar
    await expect(main).toBeHidden();
    await expect(banner.getByRole('link', { name: /New recipe/ })).toHaveCount(0);
    const b = (await burger.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeLessThan((await banner.locator('a.logo').boundingBox())!.x);
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    const drawer = await openDrawer(page);
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer.getByRole('link')).toHaveText(['Ricettine', 'Discover', 'My kitchen', 'New recipe']);
    await expect(drawer.getByRole('link', { name: 'Ricettine' })).toHaveCSS('color', 'rgb(71, 112, 53)'); // green on white
    await expect(drawer.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
    await expect(drawer.getByRole('link', { name: 'Discover' })).toBeFocused(); // focus moves into the panel
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(burger).toBeFocused(); // and back to ☰
    // a tap outside closes it too
    await openDrawer(page);
    await page.mouse.click(page.viewportSize()!.width - 10, page.viewportSize()!.height - 10);
    await expect(page.getByRole('navigation', { name: 'Sections', exact: true })).toHaveCount(0);
  }
  // the pistachio palette: a green top bar with white text, and the white "+ New recipe" pill on desktop
  await expect(banner).toHaveCSS('background-color', 'rgb(71, 112, 53)');
  await expect(banner.locator('a.logo')).toHaveCSS('color', 'rgb(255, 255, 255)');
  if (testInfo.project.name === 'desktop') {
    await expect(banner.getByRole('link', { name: '+ New recipe' })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  // Settings and Log out are not in the bars: they open from the name in the top bar
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  const menu = await openAccountMenu(page);
  await expect(menu.getByRole('link')).toHaveText(['View profile', 'Settings']);
  await expect(menu.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(banner.locator('app-account-menu button.trigger')).toBeFocused();
  await expect(banner.getByText(who.displayName, { exact: true })).toBeVisible();
});

test('a new recipe opens the editor route and is listed as a draft', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'draft');
  await navTo(page, 'My kitchen', testInfo.project.name);
  await page.getByRole('link', { name: 'Recipes', exact: true }).click();
  await expect(page).toHaveURL(/\/kitchen\/recipes$/);
  await expect(page.getByText('You have no recipes yet.')).toBeVisible();

  await clickNewRecipe(page, testInfo.project.name);
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const id = page.url().match(/\/recipes\/([0-9a-f-]{36})\/edit$/)![1];

  await page.goto('/kitchen/recipes');
  // a card opens the recipe page, never the editor (Edit is there)
  const item = page.locator(`a.recipe[href="/recipes/${id}/view"]`);
  await expect(item).toBeVisible();
  await expect(item).toContainText('Untitled recipe');
  await expect(item).toContainText('Draft');
});
