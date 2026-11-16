import { expect } from '@playwright/test';
import { addCoverPhoto, createRecipe, linkIn, newUserPage, openRecipeShare, recipeIdOf, recipeShareUrl, test } from '../helpers';

test('recipe page layout: desktop header card beside the photo, then ingredients beside steps; phone details on the photo', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'view');
  const editorUrl = await createRecipe(page, {
    title: 'Layout pie',
    ingredients: ['flour', 'butter'],
    steps: ['Mix', 'Bake', 'Rest', 'Serve', 'Eat', 'Share'],
  });
  await addCoverPhoto(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  // the editor no longer shows the share link; Share is on the recipe page
  await expect(page.locator('[data-url]')).toHaveCount(0);
  const shareUrl = await recipeShareUrl(page, recipeIdOf(editorUrl));
  await page.goto(new URL(shareUrl).pathname);

  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const title = await box('.recipe-head h1');
  const meta = await box('.recipe-head .meta');
  const cover = await box('.recipe-head img.cover');
  const ingredients = await box('section.ingredients');
  const firstStep = await box('ol.steps li');
  await expect(page.locator('ol.steps li').first()).toHaveCSS('border-top-style', 'solid'); // steps are cards
  await expect(page.locator('section.ingredients h2')).toHaveText('Ingredients');
  if (desktop) {
    // header card: title and details left, the action buttons and the photo right; the photo fills the rest
    expect(meta.y).toBeGreaterThan(title.y);
    expect(cover.x).toBeGreaterThan(meta.x + meta.width - 1);
    await expect(page.locator('.recipe-head .actions').getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More actions' })).toBeHidden();
    // below: the ingredients beside the steps, the ingredients staying in view
    expect(ingredients.y).toBeGreaterThan(cover.y + cover.height - 1);
    expect(firstStep.x).toBeGreaterThan(ingredients.x + ingredients.width - 1);
    await page.mouse.wheel(0, 1500);
    await expect(page.locator('section.ingredients')).toBeInViewport();
  } else {
    // the title and the details sit on the photo; ⋯ in its corner; then the ingredients (full width), then the steps
    expect(title.y).toBeGreaterThan(cover.y);
    expect(title.y + title.height).toBeLessThan(cover.y + cover.height + 1);
    expect(meta.y + meta.height).toBeLessThan(cover.y + cover.height + 1);
    await expect(page.locator('.recipe-head .actions')).toBeHidden();
    const more = page.getByRole('button', { name: 'More actions' });
    const m = (await more.boundingBox())!;
    expect(m.y).toBeLessThan(cover.y + 24);
    expect(m.x + m.width).toBeGreaterThan(cover.x + cover.width - 24);
    expect(ingredients.y).toBeGreaterThan(cover.y + cover.height - 1);
    expect(ingredients.width).toBeGreaterThan(page.viewportSize()!.width - 40);
    expect(firstStep.y).toBeGreaterThan(ingredients.y);
    // the ⋯ menu: Add to cookbook, Edit, Share, and Keep screen on (a checkable item)
    await more.click();
    await expect(page.getByRole('menuitem')).toHaveText(['Add to cookbook', 'Edit', 'Share']);
    await expect(page.getByRole('menuitemcheckbox', { name: /Keep screen on/ })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('Share on the recipe page: every reader gets the link; the author also resets it, and the page moves to the new link', async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const { page } = await newUserPage(browser, testInfo, 'vshare');
  const editorUrl = await createRecipe(page, { title: 'Shareable pie', ingredients: ['flour'], steps: ['Bake'] });
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  const oldPath = new URL(await recipeShareUrl(page, recipeIdOf(editorUrl))).pathname;
  await page.goto(oldPath);

  const sheet = await openRecipeShare(page, project);
  expect(new URL(await linkIn(sheet)).pathname).toBe(oldPath);
  await sheet.getByRole('button', { name: 'Reset link' }).click();
  await page.getByRole('dialog', { name: 'Reset the share link?' }).getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(oldPath);
  // the sheet stays open with the new link
  await expect(sheet.getByText('Link reset. The old link no longer works.')).toBeVisible();
  expect(new URL(await linkIn(sheet)).pathname).toBe(new URL(page.url()).pathname);
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shareable pie', level: 1 })).toBeVisible();
  await expect(page.getByText('Bake')).toBeVisible();
});
