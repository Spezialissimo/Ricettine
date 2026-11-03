import { BrowserContext, Page, expect, test } from '@playwright/test';
import { ADMIN, Person, createInvitePath, logIn, logOut, newContext, person, register } from './helpers';

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

  test('admin logs in and the home shows their name, with an Admin link', async () => {
    await admin.goto('/');
    await expect(admin).toHaveURL(/\/login\?next=%2F$/);
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
    await logIn(admin, ADMIN); // regression: the first login after logout used to return 403
  });

  test('invited person registers and lands on home without an Admin link', async () => {
    await register(user, invitePath, who);
    await expect(user.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(user.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('the new user logs out, logs in, and cannot open /admin/users', async () => {
    await logOut(user);
    await logIn(user, who);
    await user.goto('/admin/users');
    await expect(user).not.toHaveURL(/\/admin\//);
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
