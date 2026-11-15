import { expect } from '@playwright/test';
import { accountMenuLink, newUserPage, test } from '../helpers';

const LIGHT_BG = 'rgb(246, 248, 245)'; // a faint green tint (owner: no yellow cast)
const DARK_BG = 'rgb(19, 22, 18)';
const LIGHT_BAR = 'rgb(71, 112, 53)';
const DARK_BAR = 'rgb(36, 54, 28)';

test('System follows the device; Light and Dark override it and survive a reload', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'theme');
  const body = page.locator('body');
  const banner = page.getByRole('banner');

  // System (default): light device -> light, dark device -> dark
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(body).toHaveCSS('background-color', LIGHT_BG);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(body).toHaveCSS('background-color', DARK_BG);
  await expect(banner).toHaveCSS('background-color', DARK_BAR);

  // Light wins over a dark device, and is still chosen after a reload
  await accountMenuLink(page, 'Settings');
  await page.getByRole('link', { name: 'Appearance' }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole('radio', { name: /^System/ })).toBeChecked();
  await page.getByRole('radio', { name: /^Light/ }).check();
  await expect(body).toHaveCSS('background-color', LIGHT_BG);
  await page.reload();
  await expect(page.getByRole('radio', { name: /^Light/ })).toBeChecked();
  await expect(body).toHaveCSS('background-color', LIGHT_BG);
  await expect(banner).toHaveCSS('background-color', LIGHT_BAR);

  // Dark wins over a light device
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('radio', { name: /^Dark/ }).check();
  await expect(body).toHaveCSS('background-color', DARK_BG);
  await page.reload();
  await expect(body).toHaveCSS('background-color', DARK_BG);

  // back to System: follows the (light) device again
  await page.getByRole('radio', { name: /^System/ }).check();
  await expect(body).toHaveCSS('background-color', LIGHT_BG);
  for (const radio of await page.getByRole('radio').all()) {
    const label = radio.locator('xpath=ancestor::label[1]');
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('dark mode keeps text readable: light text on dark cards, readable errors', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'themedark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/kitchen');
  await expect(page.getByRole('heading', { name: 'My kitchen', level: 1 })).toHaveCSS('color', 'rgb(233, 236, 230)');
  await page.route('**/api/auth/logout', (route) => route.abort('failed'));
  const menu = page.locator('#account-panel');
  await page.getByRole('banner').locator('app-account-menu button.trigger').click();
  await expect(menu).toHaveCSS('background-color', 'rgb(28, 32, 27)');
  await menu.getByRole('button', { name: 'Log out' }).click();
  await expect(menu.getByRole('alert')).toHaveCSS('color', 'rgb(242, 184, 181)');
});
