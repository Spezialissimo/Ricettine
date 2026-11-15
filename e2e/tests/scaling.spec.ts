import { expect } from '@playwright/test';
import { newContext, newUserPage, publishRecipe, test } from '../helpers';

test('scales ingredient amounts with kitchen fractions; the servings pill shows when scaled', async ({ browser }, testInfo) => {
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
  const pill = ing.locator('app-portions-stepper');
  await expect(status).toHaveText('3 servings');
  await expect(pill).not.toHaveClass(/scaled/);
  // one pill "− 3 servings +", centred at the top of the ingredients card; no Reset button
  const card = (await ing.locator('.ing-card').boundingBox())!;
  const p = (await pill.boundingBox())!;
  expect(Math.abs(p.x + p.width / 2 - (card.x + card.width / 2))).toBeLessThan(3);
  await expect(ing.getByRole('button', { name: 'Reset' })).toHaveCount(0);

  await fewer.click();
  await fewer.click();
  await expect(status).toHaveText('1 serving');
  await expect(pill).toHaveClass(/scaled/); // a soft green fill while scaled
  await expect(fewer).toBeDisabled();
  await expect(row('milk')).toContainText(/⅓\s*cup/);
  await expect(row('sugar')).toContainText(/335\s*g/);
  await expect(row('salt')).toHaveText('salt');

  for (const b of [fewer, more]) {
    const box = await b.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  for (let n = 2; n <= 9; n++) {
    await more.click();
    await expect(status).toHaveText(`${n} servings`);
  }
  await expect(row('milk')).toContainText(/3\s*cups/); // plural once more than one
  await expect(row('sugar')).toContainText(/3,000\s*g/);
  await expect(row('salt')).toHaveText('salt');

  // back to the written number with −: amounts as written, the pill no longer marked
  for (let n = 8; n >= 3; n--) await fewer.click();
  await expect(status).toHaveText('3 servings');
  await expect(pill).not.toHaveClass(/scaled/);
  await expect(row('milk')).toContainText(/1\s*cup/);
  await expect(row('sugar')).toContainText(/1,000\s*g/);
});
