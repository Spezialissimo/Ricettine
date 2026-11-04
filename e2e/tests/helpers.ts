import { Browser, BrowserContext, Page, TestInfo, expect } from '@playwright/test';

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

/** A fresh browser context configured exactly like the current project (viewport, touch, UA). */
export function newContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  return browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
}

/** "Landed on home": the My recipes heading and the user's display name in the shell. */
export async function expectHome(page: Page, displayName: string) {
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole('heading', { name: 'My recipes' })).toBeVisible();
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

/** Registers a new regular user (via an invite from the shared admin) and returns their logged-in page. */
export async function newUserPage(browser: Browser, testInfo: TestInfo, tag: string) {
  const who = person(testInfo, tag);
  const adminCtx = await newContext(browser, testInfo);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/login');
  await logIn(adminPage, ADMIN);
  const invitePath = await createInvitePath(adminPage);
  await adminCtx.close();

  const context = await newContext(browser, testInfo);
  const page = await context.newPage();
  await register(page, invitePath, who);
  return { who, context, page };
}

export type NewRecipeData = {
  title: string;
  /** Ingredient names (one group, no amounts). */
  ingredients?: string[];
  /** Step texts. */
  steps?: string[];
};

/**
 * Drives the UI: New recipe, fill the editor, wait for "Saved ✓". Returns the editor URL
 * (the page stays on the editor).
 */
export async function createRecipe(page: Page, data: NewRecipeData): Promise<string> {
  await page.goto('/recipes/new');
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  await page.getByLabel('Title').fill(data.title);
  for (const [i, name] of (data.ingredients ?? []).entries()) {
    if (i === 0) await page.getByRole('button', { name: '+ Ingredient' }).click();
    else await page.getByRole('button', { name: '+ Ingredient' }).last().click();
    await page.getByLabel('Ingredient', { exact: true }).nth(i).fill(name);
  }
  for (const [i, text] of (data.steps ?? []).entries()) {
    await page.getByRole('button', { name: '+ Add step' }).or(page.getByRole('button', { name: '+ Next step' })).filter({ visible: true }).click();
    await page.getByRole('textbox', { name: /^Step \d+$/ }).nth(i).fill(text);
  }
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();
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
