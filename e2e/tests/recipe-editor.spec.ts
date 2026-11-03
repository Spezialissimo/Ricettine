import { Locator, Page, expect, test } from '@playwright/test';
import { createRecipe, newUserPage } from './helpers';

const newRecipeLink = (page: Page, project: string) =>
  project === 'desktop'
    ? page.getByRole('link', { name: '+ New recipe' })
    : page.getByRole('link', { name: 'New recipe', exact: true });

async function addStep(page: Page, desktop: boolean, current?: Locator) {
  if (desktop && current) await current.press('Control+Enter');
  else if (desktop) await page.getByRole('button', { name: '+ Add step' }).click();
  else await page.getByRole('button', { name: '+ Next step' }).click();
}

test('create, autosave and publish a recipe, text only', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page, context } = await newUserPage(browser, testInfo, 'recipe');

  await newRecipeLink(page, testInfo.project.name).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const editUrl = page.url();

  // layout
  const ingHead = (await page.getByRole('heading', { name: 'Ingredients' }).boundingBox())!;
  const stepsHead = (await page.getByRole('heading', { name: 'Steps' }).boundingBox())!;
  const bar = page.getByRole('button', { name: '+ Next step' });
  if (desktop) {
    expect(stepsHead.x).toBeGreaterThan(ingHead.x + 300);
    await expect(bar).toBeHidden();
  } else {
    expect(stepsHead.y).toBeGreaterThan(ingHead.y);
    await expect(bar).toBeVisible();
  }

  await page.getByLabel('Title').fill('Lasagne');

  await page.getByRole('button', { name: /^Serves/ }).click();
  const portions = page.getByRole('dialog', { name: 'How many does it serve?' });
  for (let i = 0; i < 3; i++) await portions.getByRole('button', { name: 'More portions' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Serves 4' })).toBeVisible();

  await page.getByRole('button', { name: '+ Prep time' }).click();
  await page.getByRole('dialog', { name: 'Times' }).getByRole('button', { name: '30m' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();

  await page.getByRole('button', { name: '+ Source' }).click();
  await page.getByRole('dialog', { name: "Where's it from?" }).getByLabel('Source').fill('Nonna');
  await page.keyboard.press('Escape');

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
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();

  // reload restores everything
  await page.reload();
  await expect(page.getByLabel('Title')).toHaveValue('Lasagne');
  await expect(page.getByRole('button', { name: 'Serves 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prep 30m' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Source: Nonna' })).toBeVisible();
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
    await stepBoxes.nth(0).click();
    await page.getByRole('button', { name: 'Delete step' }).click();
  }
  await expect(stepBoxes).toHaveCount(1);
  await stepBoxes.nth(0).click();
  await expect(page.getByRole('button', { name: 'Delete step' })).toBeDisabled();
  await expect(steps.getByText('A published recipe needs at least one.')).toBeVisible();

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  const card = page.locator('a.recipe').filter({ hasText: 'Lasagne' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Private');

  // Done on an untouched new draft: not listed
  await newRecipeLink(page, testInfo.project.name).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Title')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.locator('a.recipe')).toHaveCount(1);
  void editUrl;
  await context.close();
});

test('createRecipe helper builds a saved recipe through the UI', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'helper');
  const url = await createRecipe(page, { title: 'Soup', ingredients: ['leek', 'potato'], steps: ['Chop', 'Simmer'] });
  await page.goto(url);
  await expect(page.getByLabel('Title')).toHaveValue('Soup');
  await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: /^Step \d+$/ })).toHaveCount(2);
  await context.close();
});
