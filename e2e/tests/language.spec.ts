import { expect, type Page } from '@playwright/test';
import { accountMenuLink, createRecipe, logOut, newContext, newUserPage, recipeIdOf, test } from '../helpers';

/** Settings > Language through the account menu, in whichever language the page is in. */
async function openLanguageSettings(page: Page, settings: string, language: string) {
  await accountMenuLink(page, settings);
  await page.getByRole('link', { name: language, exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/language$/);
}

test('an Italian browser gets Italian; a choice made in Settings is kept in this browser', async ({ browser }, testInfo) => {
  const { who, context } = await newUserPage(browser, testInfo, 'lang-it');
  await context.close();

  const ctx = await newContext(browser, testInfo, { locale: 'it-IT' });
  const page = await ctx.newPage();
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page).toHaveTitle('Accedi · Ricettine');
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByRole('heading', { name: 'Ultime ricette' })).toBeVisible();

  // System (the default) names the browser language; English switches at once, without a reload
  await openLanguageSettings(page, 'Impostazioni', 'Lingua');
  await expect(page.getByRole('radio', { name: /^Sistema/ })).toBeChecked();
  await expect(page.getByText('Come questo browser: Italiano')).toBeVisible();
  await page.getByRole('radio', { name: 'English' }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'Language' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Language · Ricettine');

  // kept in this browser: after a reload, and after logging out (a browser setting, not a person's)
  await page.reload();
  await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
  await logOut(page);
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

  // back to System: Italian again
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  await openLanguageSettings(page, 'Settings', 'Language');
  await page.getByRole('radio', { name: /^System/ }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'Lingua' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
});

test('an English browser can choose Italiano; another browser starts from its own language', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'lang-en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await openLanguageSettings(page, 'Settings', 'Language');
  await page.getByRole('radio', { name: 'Italiano' }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'Lingua' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ultime ricette' })).toBeVisible();

  const other = await (await newContext(browser, testInfo)).newPage();
  await other.goto('/login');
  await expect(other.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(other.locator('html')).toHaveAttribute('lang', 'en');
});

test('units read singular or plural in each language; amounts take a comma or a dot', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'lang-units');
  const editorUrl = await createRecipe(page, {
    title: 'Pasta aglio e burro',
    portions: 2,
    ingredients: [
      { name: 'aglio', amount: '2', unit: 'clove' },
      { name: 'farina', amount: '1.000', unit: 'kg' }, // a dot or a comma is a decimal point: 1 kg
      { name: 'burro', amount: '0,5', unit: 'cup' },
    ],
    steps: ['Mescola'],
  });
  const id = recipeIdOf(editorUrl);

  // the editor writes saved amounts with the language's decimal separator
  await page.reload();
  const amounts = page.getByLabel('Amount', { exact: true });
  await expect(amounts.nth(1)).toHaveValue('1');
  await expect(amounts.nth(2)).toHaveValue('0.5');

  const ing = page.locator('.ingredients');
  const row = (name: string) => ing.locator('li').filter({ hasText: name });
  await page.goto(`/recipes/${id}/view`);
  await expect(row('aglio')).toContainText(/2\s*cloves/);
  await expect(row('farina')).toContainText(/1\s*kg/);
  await expect(row('burro')).toContainText(/½\s*cup\b/);

  await openLanguageSettings(page, 'Settings', 'Language');
  await page.getByRole('radio', { name: 'Italiano' }).check();

  await page.goto(`/recipes/${id}/view`);
  await expect(row('aglio')).toContainText(/2\s*spicchi/);
  await expect(row('farina')).toContainText(/1\s*kg/);
  await expect(row('burro')).toContainText(/½\s*tazza/);
  const status = ing.getByRole('status');
  await expect(status).toHaveText('2 porzioni');
  await ing.getByRole('button', { name: 'Meno porzioni' }).click();
  await expect(status).toHaveText('1 porzione');
  await expect(row('aglio')).toContainText(/1\s*spicchio\b/);

  await page.goto(editorUrl);
  await expect(page.getByLabel('Quantità', { exact: true }).nth(2)).toHaveValue('0,5');
});
