import { expect, type Page } from '@playwright/test';
import { navTo, newContext, openAccountMenu, test } from '../helpers';
import { newDemoContext } from '../helpers/demo';

const banner = (page: Page) => page.getByText("This is a demo: explore and try the editor, but changes aren't saved.");

test('the demo lands on the feed, signed in as a guest, with the banner and no login form', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  await expect(page.getByText('Spaghetti alla carbonara').first()).toBeVisible();
  await expect(banner(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log in' })).toHaveCount(0);
});

test('a demo recipe with step photos shows them in its steps', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByText('Bigos, lo stufato del cacciatore').first().click();
  await expect(page.getByRole('heading', { name: 'Bigos, lo stufato del cacciatore', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Step 1', exact: true }).first()).toBeVisible();
});

test("a recipe author without a photo shows their initial", async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByText("Penne all'arrabbiata").first().click();
  await expect(page.getByRole('heading', { name: "Penne all'arrabbiata", level: 1 })).toBeVisible();
  await expect(page.locator('.author app-avatar')).toHaveText('O');
});

test('a deep link on a first visit lands on the target, not on login', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/u/davide');
  await expect(page).toHaveURL(/\/u\/davide$/);
  await expect(page.getByRole('heading', { name: 'Davide', level: 1 })).toBeVisible();
  await expect(banner(page)).toBeVisible();
});

/** Keys of the editor's local backup (UnsavedBackup KEY_PREFIX); the demo must never write one. */
const backupKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ricettine.unsaved.')));

test('the editor takes typing but never saves, and keeps no backup', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/recipes') && ['PUT', 'POST', 'PATCH', 'DELETE'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
  });
  await page.goto('/recipes/new');
  await expect(page).toHaveURL(/\/recipes\/local\/edit$/);
  await page.getByLabel('Title').fill('Demo-only soup');
  await expect(page.getByRole('status').getByText('Demo mode: not saved').first()).toBeVisible();
  // long enough for any autosave debounce to have fired
  await page.waitForTimeout(6000);
  await expect(page.getByLabel('Title')).toHaveValue('Demo-only soup');
  expect(writes).toEqual([]);
  expect(await backupKeys(page)).toEqual([]);

  await page.reload();
  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByText('Changes you made earlier on this device had not been saved. They were restored.')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(await backupKeys(page)).toEqual([]);
});

test('write controls are absent: no logout, no delete, no member management, no new cookbook', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();

  const panel = await openAccountMenu(page);
  await expect(panel.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByText('Spaghetti alla carbonara').first().click();
  await expect(page.getByRole('heading', { name: 'Spaghetti alla carbonara', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);

  await page.goto('/cookbooks');
  await expect(page.getByRole('link', { name: /Primi della domenica/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /New cookbook|Create your first cookbook/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Primi della domenica/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Primi della domenica', level: 1 })).toBeVisible();
  await expect(page.getByText('Members', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Invite co-author|Remove/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('losing the session signs in again silently', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  const visitedLogin: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && /\/login/.test(frame.url())) visitedLogin.push(frame.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();

  await context.clearCookies();
  await page.goto('/u/davide');
  await expect(page.getByRole('heading', { name: 'Davide', level: 1 })).toBeVisible();

  await context.clearCookies();
  await page.goto('/cookbooks');
  await expect(page.getByRole('link', { name: /Primi della domenica/ }).first()).toBeVisible();

  await context.clearCookies();
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('link', { name: /Primi della domenica/ }).first()).toBeVisible();
  expect(visitedLogin).toEqual([]);
});

test('losing the session while the page stays open re-authenticates in the app and retries', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest recipes' })).toBeVisible();
  // listeners first, then lose the session and navigate in the app: no page.goto, no reload
  const unauthorized: string[] = [];
  const reauth: string[] = [];
  const navigations: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() === 401) unauthorized.push(res.url());
  });
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/demo/session')) reauth.push(req.url());
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await context.clearCookies();

  // My kitchen needs a session (a public recipe page would load for anyone, so would never answer 401)
  await navTo(page, 'My kitchen', testInfo.project.name);
  await expect(page).toHaveURL(/\/kitchen/);
  await expect(page.getByRole('navigation', { name: 'My kitchen sections' })).toBeVisible();
  expect(unauthorized.length).toBeGreaterThan(0);
  expect(reauth.length).toBeGreaterThan(0);
  expect(navigations.filter((u) => u.includes('/login'))).toEqual([]);
});

test('the main site login offers the demo, and is not the demo', async ({ browser }, testInfo) => {
  const context = await newContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', 'http://demo.localhost:8080');
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('the language can be switched in the demo', async ({ browser }, testInfo) => {
  const context = await newDemoContext(browser, testInfo);
  const page = await context.newPage();
  await page.goto('/settings/language');
  await expect(page.getByRole('heading', { level: 1, name: 'Language' })).toBeVisible();
  await page.getByRole('radio', { name: 'Italiano' }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'Lingua' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByText("Questa è una demo: puoi esplorare e provare l'editor, ma le modifiche non vengono salvate.")).toBeVisible();
});
