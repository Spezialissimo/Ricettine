import { Locator, Page, expect } from '@playwright/test';
import { clickNewRecipe, createRecipe, expectSaved, leaveUntouchedDraft, logIn, logOut, newUserPage, test } from '../helpers';

async function addStep(page: Page, desktop: boolean, current?: Locator) {
  if (desktop && current) await current.press('Control+Enter');
  else await page.getByRole('button', { name: 'Add step', exact: true }).click(); // in the Steps section on both layouts
}

test('create, autosave and publish a recipe, text only', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'recipe');

  await clickNewRecipe(page, testInfo.project.name);
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);

  // layout
  const ingHead = (await page.getByRole('heading', { name: 'Ingredients' }).boundingBox())!;
  const stepsHead = (await page.getByRole('heading', { name: 'Steps' }).boundingBox())!;
  const bar = page.locator('.bottom-bar').getByRole('button', { name: 'Publish', exact: true }); // phone: Publish at the bottom
  if (desktop) {
    expect(stepsHead.x).toBeGreaterThan(ingHead.x + 300);
    await expect(bar).toBeHidden();
  } else {
    expect(stepsHead.y).toBeGreaterThan(ingHead.y);
    // notes come before the steps on the phone
    const notesBox = (await page.getByLabel('Notes').boundingBox())!;
    expect(notesBox.y).toBeLessThan(stepsHead.y);
    await expect(bar).toBeVisible();
  }

  await page.getByLabel('Title').fill('Lasagne');

  await page.getByRole('button', { name: /^Serves/ }).click();
  const portions = page.getByRole('dialog', { name: 'How many does it serve?' });
  for (let i = 0; i < 3; i++) await portions.getByRole('button', { name: 'More portions' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Serves 4' })).toBeVisible();

  await page.getByRole('button', { name: '+ Prep time' }).click();
  await page.getByRole('dialog', { name: 'Prep time' }).getByRole('button', { name: '30m' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();

  await page.getByLabel('Source', { exact: true }).fill('Nonna'); // a plain field, not a sheet

  // two ingredient groups
  const groups = page.locator('.ing-group');
  await page.getByRole('button', { name: '+ Ingredient' }).click();
  await expect(groups).toHaveCount(1);
  await groups.nth(0).getByLabel('Group name').fill('Ragu');
  await groups.nth(0).getByLabel('Amount').fill('500');
  await groups.nth(0).getByLabel('Unit').selectOption('g');
  await groups.nth(0).getByLabel('Ingredient', { exact: true }).fill('minced beef');
  await page.getByRole('button', { name: '+ Group' }).click();
  await expect(groups).toHaveCount(2);
  await groups.nth(1).getByLabel('Group name').fill('Besciamella');
  await groups.nth(1).getByRole('button', { name: '+ Ingredient' }).click();
  await groups.nth(1).getByLabel('Amount').fill('1/2');
  await groups.nth(1).getByLabel('Unit').selectOption('l');
  await groups.nth(1).getByLabel('Ingredient', { exact: true }).fill('milk');

  // invalid amount: inline error, nothing wrong gets saved
  const amount = groups.nth(1).getByLabel('Amount');
  await amount.fill('abc');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(groups.nth(1).getByText('Enter a number such as 0.5, 1/2 or 1 1/2.')).toBeVisible();
  await amount.fill('1/2');
  await expect(amount).toHaveAttribute('aria-invalid', 'false');

  // publish without steps: error on the steps section
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const steps = page.locator('section.steps');
  await expect(steps.getByText('A published recipe needs a title, at least one ingredient and at least one step.')).toBeVisible();

  // 3 steps (Ctrl+Enter on desktop, + Next step on the phone)
  const stepBoxes = page.getByRole('textbox', { name: /^Step \d+$/ });
  await addStep(page, desktop);
  await expect(stepBoxes).toHaveCount(1);
  await expect(stepBoxes.nth(0)).toBeFocused();
  await stepBoxes.nth(0).fill('Brown the beef');
  await addStep(page, desktop, stepBoxes.nth(0));
  await expect(stepBoxes).toHaveCount(2);
  await expect(stepBoxes.nth(1)).toBeFocused();
  await page.keyboard.type('Make the besciamella');
  await addStep(page, desktop, stepBoxes.nth(1));
  await expect(stepBoxes.nth(2)).toBeFocused();
  await page.keyboard.type('Layer and bake');

  await page.getByLabel('Notes').fill('Better the next day');
  await expectSaved(page);

  // reload restores everything
  await page.reload();
  await expect(page.getByLabel('Title')).toHaveValue('Lasagne');
  await expect(page.getByRole('button', { name: 'Serves 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();
  await expect(page.getByLabel('Source', { exact: true })).toHaveValue('Nonna');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).getByLabel('Group name')).toHaveValue('Ragu');
  await expect(groups.nth(0).getByLabel('Amount')).toHaveValue('500');
  await expect(groups.nth(0).getByLabel('Unit')).toHaveValue('g');
  await expect(groups.nth(0).getByLabel('Ingredient', { exact: true })).toHaveValue('minced beef');
  await expect(groups.nth(1).getByLabel('Amount')).toHaveValue('0.5');
  await expect(groups.nth(1).getByLabel('Unit')).toHaveValue('l');
  await expect(groups.nth(1).getByLabel('Ingredient', { exact: true })).toHaveValue('milk');
  await expect(stepBoxes).toHaveCount(3);
  await expect(stepBoxes.nth(0)).toHaveValue('Brown the beef');
  await expect(stepBoxes.nth(2)).toHaveValue('Layer and bake');
  await expect(page.getByLabel('Notes')).toHaveValue('Better the next day');

  // publish
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);

  // published: the last step cannot be deleted
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Delete step 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click(); // it asks first
  }
  await expect(stepBoxes).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete step 1' })).toBeDisabled();
  await expect(steps.getByText('A published recipe needs at least one.')).toBeVisible();

  // Save on a published recipe: its one view is the share link
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole('heading', { name: 'Lasagne', level: 1 })).toBeVisible();
  await page.goto('/kitchen/recipes');
  const card = page.locator('a.recipe').filter({ hasText: 'Lasagne' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Private');

  // Save on an untouched new draft: not listed
  await leaveUntouchedDraft(page, testInfo.project.name, 1);
});

test('createRecipe helper builds a saved recipe through the UI', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'helper');
  const url = await createRecipe(page, { title: 'Soup', ingredients: ['leek', 'potato'], steps: ['Chop', 'Simmer'] });
  await page.goto(url);
  await expect(page.getByLabel('Title')).toHaveValue('Soup');
  await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: /^Step \d+$/ })).toHaveCount(2);
});

test('a published recipe can never become incomplete', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'guard');
  await createRecipe(page, { title: 'Soup', ingredients: ['leek'], steps: ['Chop'] });
  const stepBoxes = page.getByRole('textbox', { name: /^Step \d+$/ });
  const ingredients = page.locator('section.ingredients');
  const steps = page.locator('section.steps');
  const hint = 'A published recipe needs at least one.';

  // a blank step is saved but does not count; a blank-name ingredient row is held back from saving
  await addStep(page, desktop, stepBoxes.nth(0));
  await expect(stepBoxes).toHaveCount(2);
  await ingredients.getByRole('button', { name: '+ Ingredient' }).click();
  await expect(ingredients.getByLabel('Ingredient', { exact: true })).toHaveCount(2);
  await expectSaved(page);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('.editor-header .state')).toContainText('Published');

  // (c) R10: the real step is the last counting one even though a blank step exists
  await expect(page.getByRole('button', { name: 'Delete step 1' })).toBeDisabled();
  await expect(steps.getByText(hint)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete step 2' })).toBeEnabled();

  // (b) the last ingredient and the last group cannot be deleted (the blank row was never saved: publishing adopts the server copy)
  const rows = ingredients.locator('.ing-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole('button', { name: 'Delete ingredient leek' })).toBeDisabled();
  await expect(ingredients.getByRole('button', { name: 'Delete group' })).toBeDisabled();
  await expect(ingredients.getByText(hint)).toBeVisible();

  // (a) clearing the title is rejected, the recipe stays published with its title
  await page.getByLabel('Title').fill('');
  await expect(page.locator('.title-field .field-error')).toContainText('A published recipe needs a title');
  await expect(page.getByRole('status').getByText('Not saved')).toBeVisible();
  // the server copy is untouched: still published, still titled
  const id = new URL(page.url()).pathname.split('/')[2];
  const saved = await (await page.request.get(`/api/recipes/${id}`)).json();
  expect(saved).toMatchObject({ title: 'Soup', status: 'PUBLISHED' });
  // a reload keeps what was typed (the local backup) and the same refusal, never a silent loss either way
  await page.reload();
  await expect(page.locator('.editor-header .state')).toContainText('Published');
  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.title-field .field-error')).toBeVisible();
  await page.getByLabel('Title').fill('Soup');
  await expectSaved(page);
  await page.reload();
  await expect(page.getByLabel('Title')).toHaveValue('Soup');
});

test('ingredient row: the name is the wide field and nothing overflows the panel', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'ingrow');
  await createRecipe(page, { title: 'Bread', ingredients: ['flour'] });
  const section = page.locator('section.ingredients');
  const row = section.locator('.ing-row').first();
  const name = row.getByLabel('Ingredient', { exact: true });
  const del = row.getByRole('button', { name: 'Delete ingredient flour' });
  await expect(name).toBeVisible();
  await expect(del).toBeVisible();

  const check = async () => {
    const panel = (await section.boundingBox())!;
    const n = (await name.boundingBox())!;
    const d = (await del.boundingBox())!;
    expect(n.width).toBeGreaterThanOrEqual(desktop ? 160 : 120);
    expect(d.width).toBeGreaterThanOrEqual(44);
    expect(d.height).toBeGreaterThanOrEqual(44);
    for (const field of [row.getByLabel('Amount'), row.getByLabel('Unit'), name, row.getByLabel('Note'), del]) {
      const b = (await field.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
    return { n, d };
  };
  const { n, d } = await check();
  if (desktop) {
    // as in the mockup: amount, unit, name and the delete icon on one line (the note goes below)
    expect(Math.abs(n.y + n.height / 2 - (d.y + d.height / 2))).toBeLessThan(4);
    await page.setViewportSize({ width: 800, height: 800 }); // narrowest desktop width: still no overflow
    await check();
  }
});

test('logging out right after typing keeps the text', async ({ browser }, testInfo) => {
  const { page, who } = await newUserPage(browser, testInfo, 'logout');
  const url = await createRecipe(page, { title: 'Pie' });
  await page.getByLabel('Title').fill('Pie with apples');
  await logOut(page); // no wait for "Saved ✓"
  await logIn(page, who);
  await page.goto(url);
  await expect(page.getByLabel('Title')).toHaveValue('Pie with apples');
});

test('editor: steps are separate cards, delete asks first, Preview shows the reader view and returns', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'preview');
  const url = await createRecipe(page, { title: 'Preview pie', ingredients: ['flour'], steps: ['Mix', 'Bake'] });
  const cards = page.locator('li.step');
  await expect(cards.first()).toHaveCSS('border-top-style', 'solid');
  // the card's header: move handle, number, then the delete icon right after the number
  const card = (await cards.nth(1).boundingBox())!;
  const bin = (await page.getByRole('button', { name: 'Delete step 2' }).boundingBox())!;
  const grip = (await page.getByRole('button', { name: 'Reorder step 2' }).boundingBox())!;
  const num = (await cards.nth(1).locator('.step-number').boundingBox())!;
  expect(grip.x).toBeLessThan(num.x);
  expect(bin.x).toBeGreaterThan(num.x + num.width);
  expect(bin.x).toBeLessThan(num.x + num.width + 24);
  expect(Math.abs(bin.y + bin.height / 2 - (num.y + num.height / 2))).toBeLessThan(3);
  expect(bin.y).toBeLessThan(card.y + 24);

  // delete asks; Cancel keeps the step
  await page.getByRole('button', { name: 'Delete step 2' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete step 2?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(cards).toHaveCount(2);

  // phone: Publish and Preview at the bottom, Add step inside the Steps section
  if (!desktop) {
    await expect(page.locator('.bottom-bar').getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    await expect(page.locator('section.steps').getByRole('button', { name: 'Add step', exact: true })).toBeVisible();
    await expect(page.locator('.editor-header').getByRole('button', { name: 'Publish', exact: true })).toBeHidden();
  }

  const preview = desktop ? page.locator('.editor-header').getByRole('button', { name: 'Preview' }) : page.locator('.bottom-bar').getByRole('button', { name: 'Preview' });
  await preview.click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/preview$/);
  const banner = page.locator('.preview-banner');
  await expect(banner.getByText('Preview: this is how readers will see your recipe.')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Back to editor' })).toHaveCount(0);
  // the banner stays in view while scrolling
  await page.mouse.wheel(0, 2000);
  await expect(banner).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Preview pie', level: 1 })).toBeVisible();
  await expect(page.getByText('Bake')).toBeVisible();
  await banner.getByRole('link', { name: 'Back to editor' }).click();
  await expect(page).toHaveURL(url);
});
