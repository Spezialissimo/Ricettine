import { Browser, Page, TestInfo, expect } from '@playwright/test';
import { newContext } from './test';
import { expectSaved } from './ui';

export { newContext, test } from './test';
export * from './ui';

/** The administrator created once by auth.setup.ts and shared by every project. */
export const ADMIN = {
  email: 'admin@e2e.example.test',
  username: 'e2e_admin',
  displayName: 'E2E Admin',
  password: 'e2e-admin-password-1',
};

export type Person = typeof ADMIN;

/** A person unique per project, file tag and run, so mobile and desktop never collide. */
export function person(testInfo: TestInfo, tag: string): Person {
  const project = testInfo.project.name;
  const stamp = Date.now().toString(36);
  const handle = `${tag}_${project}_${stamp}`.replace(/[^a-z0-9_]/g, '');
  return {
    email: `${handle}@e2e.example.test`,
    username: handle.slice(0, 30),
    displayName: `${tag} ${project} ${stamp}`,
    password: 'e2e-user-password-1',
  };
}

/** "Landed on home": the feed at `/` and the user's display name in the shell. */
export async function expectHome(page: Page, displayName: string) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  await expect(page.getByRole('banner').getByText(displayName, { exact: true })).toBeVisible();
}

export async function logIn(page: Page, who: Pick<Person, 'email' | 'password' | 'displayName'>) {
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expectHome(page, who.displayName);
}

export async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** As the logged-in admin: create an invite through the UI and return the path of the invite link. */
export async function createInvitePath(page: Page): Promise<string> {
  await page.goto('/admin/invites');
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByRole('heading', { name: 'Invite link (single use)' })).toBeVisible();
  const url = (await page.locator('[data-url]').innerText()).trim();
  expect(url).toContain('/invite/');
  return new URL(url).pathname;
}

export async function register(page: Page, invitePath: string, who: Person) {
  await page.goto(invitePath);
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Display name').fill(who.displayName);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectHome(page, who.displayName);
}

/** In a throwaway context, logs in as the shared admin, creates an invite and returns its link path. */
export async function inviteAsAdmin(browser: Browser, testInfo: TestInfo): Promise<string> {
  const adminCtx = await newContext(browser, testInfo);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/login');
  await logIn(adminPage, ADMIN);
  const invitePath = await createInvitePath(adminPage);
  await adminCtx.close();
  return invitePath;
}

/** Registers a new regular user (via an invite from the shared admin) and returns their logged-in page. */
export async function newUserPage(browser: Browser, testInfo: TestInfo, tag: string) {
  const who = person(testInfo, tag);
  const invitePath = await inviteAsAdmin(browser, testInfo);

  const context = await newContext(browser, testInfo);
  const page = await context.newPage();
  await register(page, invitePath, who);
  return { who, context, page };
}

export type NewRecipeData = {
  title: string;
  /** Ingredients (one group): a bare name, or a name with an amount and a unit (the unit's select value, e.g. 'cup'). */
  ingredients?: Array<string | { name: string; amount?: string; unit?: string }>;
  /** Step texts. */
  steps?: string[];
  /** Portions the recipe serves (a new recipe starts at 1). */
  portions?: number;
};

/**
 * Drives the UI: New recipe, fill the editor, wait for "Saved ✓". Returns the editor URL
 * (the page stays on the editor).
 */
export async function createRecipe(page: Page, data: NewRecipeData): Promise<string> {
  await page.goto('/recipes/new');
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  await page.getByLabel('Title').fill(data.title);
  if (data.portions !== undefined && data.portions > 1) {
    await page.getByRole('button', { name: /^Serves/ }).click();
    const dialog = page.getByRole('dialog', { name: 'How many does it serve?' });
    for (let i = 1; i < data.portions; i++) await dialog.getByRole('button', { name: 'More portions' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: `Serves ${data.portions}` })).toBeVisible();
  }
  for (const [i, entry] of (data.ingredients ?? []).entries()) {
    const { name, amount, unit } = typeof entry === 'string' ? { name: entry, amount: undefined, unit: undefined } : entry;
    if (i === 0) await page.getByRole('button', { name: '+ Ingredient' }).click();
    else await page.getByRole('button', { name: '+ Ingredient' }).last().click();
    await page.getByLabel('Ingredient', { exact: true }).nth(i).fill(name);
    if (amount) await page.getByLabel('Amount', { exact: true }).nth(i).fill(amount);
    if (unit) await page.getByLabel('Unit', { exact: true }).nth(i).selectOption(unit);
  }
  for (const [i, text] of (data.steps ?? []).entries()) {
    await page.getByRole('button', { name: '+ Add step' }).or(page.getByRole('button', { name: '+ Next step' })).filter({ visible: true }).click();
    await page.getByRole('textbox', { name: /^Step \d+$/ }).nth(i).fill(text);
  }
  await expectSaved(page);
  return page.url();
}

/** Drives the UI: creates a cookbook named `name` and lands on its page. */
export async function createCookbook(page: Page, name: string): Promise<string> {
  await page.goto('/cookbooks');
  await page.getByRole('button', { name: '+ New cookbook' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/cookbooks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url();
}

/** Creates a recipe, publishes it (private) and returns the editor URL and the share URL. */
export async function publishRecipe(page: Page, data: NewRecipeData): Promise<{ editorUrl: string; shareUrl: string }> {
  const editorUrl = await createRecipe(page, data);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.locator('[data-url]')).toBeVisible();
  const shareUrl = (await page.locator('[data-url]').innerText()).trim();
  return { editorUrl, shareUrl };
}

/**
 * Creates, fills and publishes a recipe through the API as the logged-in user of `page` (no UI), and returns
 * its id and share token. Cheap way to put many recipes into the feed.
 */
export async function apiPublishRecipe(
  page: Page,
  data: { title: string; visibility: 'PRIVATE' | 'PUBLIC' },
): Promise<{ id: string; shareToken: string }> {
  const cookies = await page.context().cookies();
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
  const headers = { 'X-XSRF-TOKEN': xsrf };
  const created = await page.request.post('/api/recipes', { headers });
  expect(created.ok()).toBe(true);
  const { id, version } = await created.json();
  const saved = await page.request.put(`/api/recipes/${id}`, {
    headers,
    data: {
      version,
      title: data.title,
      portions: 1,
      prepMinutes: null,
      cookMinutes: null,
      source: null,
      notes: null,
      visibility: data.visibility,
      coverMediaId: null,
      groups: [{ name: null, ingredients: [{ amount: null, unit: null, name: 'salt', note: null }] }],
      steps: [{ text: 'Cook', photoMediaId: null }],
    },
  });
  expect(saved.ok()).toBe(true);
  const published = await page.request.post(`/api/recipes/${id}/publish`, {
    headers,
    data: { version: (await saved.json()).version },
  });
  expect(published.ok()).toBe(true);
  const { shareUrl } = await published.json();
  return { id, shareToken: new URL(shareUrl, 'http://x').pathname.split('/').pop()! };
}
