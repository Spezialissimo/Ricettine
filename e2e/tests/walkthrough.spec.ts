import { BrowserContext, Frame, Page, expect, test } from '@playwright/test';
import { ADMIN, Person, createInvitePath, expectHome, logIn, logOut, newContext, person, register } from './helpers';

test.describe.serial('walkthrough: admin, invite, register, logout, login', () => {
  let adminCtx: BrowserContext;
  let admin: Page;
  let userCtx: BrowserContext;
  let user: Page;
  let who: Person;
  let invitePath: string;

  test('the project viewport applies', async ({ page }, testInfo) => {
    const width = page.viewportSize()!.width;
    if (testInfo.project.name === 'desktop') expect(width).toBeGreaterThanOrEqual(1200);
    else expect(width).toBeLessThanOrEqual(450);
  });

  test.beforeAll(async ({ browser }, testInfo) => {
    who = person(testInfo, 'walk');
    adminCtx = await newContext(browser, testInfo);
    admin = await adminCtx.newPage();
    userCtx = await newContext(browser, testInfo);
    user = await userCtx.newPage();
  });
  test.afterAll(async () => {
    await adminCtx.close();
    await userCtx.close();
  });

  test('admin logs in and My recipes shows their name, with an Admin link', async () => {
    await admin.goto('/');
    await expect(admin).toHaveURL(/\/login\?next=%2Frecipes$/);
    await logIn(admin, ADMIN);
    await expect(admin.getByRole('link', { name: 'Admin' })).toBeVisible();
  });

  test('admin creates an invite and reads the link', async () => {
    await admin.getByRole('link', { name: 'Admin' }).click();
    await expect(admin).toHaveURL(/\/admin\/invites$/);
    invitePath = await createInvitePath(admin);
  });

  test('admin logs out and straight back in without a reload', async () => {
    await admin.goto('/');
    await logOut(admin);
    // Regression: the first login after logout used to return 403 (stale XSRF token). The SPA must
    // go from logout to a successful login without any full-page navigation or reload in between.
    const navigations: string[] = [];
    const onNav = (f: Frame) => {
      if (f === admin.mainFrame()) navigations.push(f.url());
    };
    admin.on('framenavigated', onNav);
    const loginResponse = admin.waitForResponse(
      (r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST',
    );
    await logIn(admin, ADMIN);
    admin.off('framenavigated', onNav);
    expect((await loginResponse).status()).toBe(200);
    // only the in-app route change after the successful login may have happened (to `/` then `/recipes`)
    expect(navigations.every((u) => ['/', '/recipes'].includes(new URL(u).pathname))).toBe(true);
  });

  test('invited person registers and lands on My recipes without an Admin link', async () => {
    await register(user, invitePath, who);
    await expect(user.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(user.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('the new user logs out, logs in, and cannot open /admin/users', async () => {
    await logOut(user);
    await logIn(user, who);
    await user.goto('/admin/users');
    await expectHome(user, who.displayName); // adminGuard redirects non-admins home (/ -> /recipes)
    await expect(user.getByRole('heading', { name: 'Users' })).toHaveCount(0);
  });

  test('the used invite link is rejected in a fresh context', async ({ browser }, testInfo) => {
    const ctx = await newContext(browser, testInfo);
    const page = await ctx.newPage();
    await page.goto(invitePath);
    await expect(page.getByText('This invite link is invalid, used or expired.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await ctx.close();
  });
});
