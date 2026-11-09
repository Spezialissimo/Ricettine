import { expect } from '@playwright/test';
import { apiPublishRecipe, createRecipe, newUserPage, pickPhoto, test } from '../helpers';

// Chromium words violations "... violates the following Content Security Policy directive ..."; the header name is hyphenated.
const CSP_MESSAGE = /Content[- ]Security[- ]Policy/i;

test('the built SPA runs under the CSP: home, editor with a photo, public recipe', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'csp');
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (CSP_MESSAGE.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (CSP_MESSAGE.test(err.message)) violations.push(err.message);
  });

  const home = await page.goto('/');
  expect(home!.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await createRecipe(page, { title: 'Csp tart', ingredients: ['flour'], steps: ['Mix'] });
  await pickPhoto(page, page.getByRole('button', { name: 'Add cover photo' }));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();

  const { shareToken } = await apiPublishRecipe(page, { title: 'Csp public', visibility: 'PUBLIC' });
  await page.goto(`/r/${shareToken}`);
  await expect(page.getByRole('heading', { name: 'Csp public' })).toBeVisible();

  expect(violations).toEqual([]);
});
