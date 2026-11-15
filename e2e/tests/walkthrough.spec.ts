import { BrowserContext, Frame, Page, expect } from '@playwright/test';
import { ADMIN, Person, accountMenuLink, createInvitePath, expectHome, logIn, logOut, newContext, openAccountMenu, person, register, test } from '../helpers';

test.describe.serial('walkthrough: admin, invite, register, logout, login', () => {
  let adminCtx: BrowserContext;
  let admin: Page;
  let userCtx: BrowserContext;
  let user: Page;
  let who: Person;
  let invitePath: string;

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

  test('admin logs in and the feed shows their name, with Admin in the account menu', async () => {
    await admin.goto('/');
    await expect(admin).toHaveURL(/\/login\?next=%2F$/);
    await logIn(admin, ADMIN);
    await expect((await openAccountMenu(admin)).getByRole('link', { name: 'Admin' })).toBeVisible();
  });

  test('admin creates an invite and reads the link', async () => {
    await accountMenuLink(admin, 'Admin');
    await expect(admin).toHaveURL(/\/settings\/admin\/invites$/);
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
    // no full navigation to anywhere but `/`; an empty list (the in-app route change) is fine
    expect(navigations.filter((u) => new URL(u).pathname !== '/')).toEqual([]);
  });

  test('invited person registers and lands on the feed without Admin anywhere', async () => {
    await register(user, invitePath, who);
    const menu = await openAccountMenu(user);
    await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(user.getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await menu.getByRole('link', { name: 'Settings' }).click();
    await expect(user.getByRole('navigation', { name: 'Settings' })).toBeVisible();
    await expect(user.getByRole('group', { name: 'Administration' })).toHaveCount(0);
    await expect(user.getByRole('link', { name: 'Invites' })).toHaveCount(0);
  });

  test('the new user logs out, logs in, and cannot open /admin/users', async () => {
    await logOut(user);
    await logIn(user, who);
    await user.goto('/settings/admin/users');
    await expectHome(user, who.displayName); // adminGuard redirects non-admins home (back to the feed at /)
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
