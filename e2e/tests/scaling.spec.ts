import { expect, test } from '@playwright/test';
import { newContext, newUserPage, publishRecipe } from './helpers';

test('scales ingredient amounts with kitchen fractions and resets', async ({ browser }, testInfo) => {
  const { page, context } = await newUserPage(browser, testInfo, 'scale');
  const { shareUrl } = await publishRecipe(page, {
    title: 'Scalable pudding',
    portions: 3,
    ingredients: [
      { name: 'milk', amount: '1', unit: 'cup' },
      { name: 'sugar', amount: '1000', unit: 'g' },
      'salt',
    ],
    steps: ['Stir'],
  });
  await context.close();

  const reader = await newContext(browser, testInfo);
  const r = await reader.newPage();
  await r.goto(new URL(shareUrl).pathname);
  const ing = r.locator('.ingredients');
  const row = (name: string) => ing.locator('li').filter({ hasText: name });
  const status = ing.getByRole('status');
  const fewer = ing.getByRole('button', { name: 'Fewer portions' });
  const more = ing.getByRole('button', { name: 'More portions' });
  await expect(status).toHaveText('Serves 3');

  await fewer.click();
  await fewer.click();
  await expect(status).toHaveText('Serves 1');
  await expect(fewer).toBeDisabled();
  await expect(row('milk')).toContainText(/⅓\s*cup/);
  await expect(row('sugar')).toContainText(/335\s*g/);
  await expect(row('salt')).toHaveText('salt');

  for (const b of [fewer, more, ing.getByRole('button', { name: 'Reset' })]) {
    const box = await b.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  for (let n = 2; n <= 9; n++) {
    await more.click();
    await expect(status).toHaveText(`Serves ${n}`);
  }
  await expect(row('milk')).toContainText(/3\s*cup/);
  await expect(row('sugar')).toContainText(/3,000\s*g/);
  await expect(row('salt')).toHaveText('salt');

  await ing.getByRole('button', { name: 'Reset' }).click();
  await expect(status).toHaveText('Serves 3');
  await expect(row('milk')).toContainText(/1\s*cup/);
  await expect(row('sugar')).toContainText(/1,000\s*g/);
  await reader.close();
});
