import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { FIXTURE_PHOTO, accountMenuLink, expectHome, newUserPage, test, navTo } from '../helpers';

const compose = process.env.E2E_COMPOSE_PROJECT;

test.skip(!compose, 'E2E_COMPOSE_PROJECT is not set: this test restarts the app container, run it via scripts/e2e.sh');

test('session and avatar survive an app restart', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const { who, page } = await newUserPage(browser, testInfo, 'restart');
  await accountMenuLink(page, 'Settings');
  await page.getByLabel('Choose photo').setInputFiles(FIXTURE_PHOTO);
  const avatar = page.getByRole('img', { name: 'Your avatar' });
  await expect(avatar).toBeVisible();
  const src = new URL((await avatar.getAttribute('src'))!, page.url()).toString();
  expect((await page.request.get(src)).status()).toBe(200);

  execFileSync('docker', ['compose', '-p', compose!, 'restart', 'app'], { stdio: 'inherit', cwd: join(import.meta.dirname, '..', '..'), env: process.env });
  await expect
    .poll(
      async () => {
        try {
          const r = await fetch(`${baseURL}/actuator/health`);
          return r.ok && (await r.text()).includes('"status":"UP"');
        } catch {
          return false;
        }
      },
      { timeout: 180_000, intervals: [2_000] },
    )
    .toBe(true);

  await page.reload();
  // still on /settings/profile: no redirect to /login, session intact, avatar rendered again
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(avatar).toBeVisible();
  await navTo(page, 'Discover', testInfo.project.name);
  await expectHome(page, who.displayName);
  await accountMenuLink(page, 'Settings');
  await expect(avatar).toBeVisible();
  expect((await page.request.get(src)).status()).toBe(200);
});
