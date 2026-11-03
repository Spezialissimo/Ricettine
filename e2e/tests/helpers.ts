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

export async function logIn(page: Page, who: Pick<Person, 'email' | 'password' | 'displayName'>) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: `Hi ${who.displayName}` })).toBeVisible();
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
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Display name').fill(who.displayName);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: `Hi ${who.displayName}` })).toBeVisible();
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
