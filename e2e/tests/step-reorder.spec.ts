import { Locator, Page, expect } from '@playwright/test';
import { createRecipe, expectSaved, newUserPage, test } from '../helpers';

const stepTexts = (page: Page) => page.getByRole('textbox', { name: /^Step \d+$/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));

/** CDK needs intermediate pointer moves: press on `from`, move in steps to `to`, release. */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  const sx = a.x + a.width / 2;
  const sy = a.y + a.height / 2;
  const ex = b.x + b.width / 2;
  const ey = b.y + 4;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy + (ey < sy ? -10 : 10), { steps: 4 });
  await page.mouse.move(ex, ey, { steps: 12 });
  await page.mouse.up();
}

test('reorder steps by handle, keyboard, and not by the text', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'reorder');
  await createRecipe(page, { title: 'Order pie', ingredients: ['flour'], steps: ['A', 'B', 'C'] });
  const handle = (n: number) => page.getByRole('button', { name: `Reorder step ${n}` });
  await expect(handle(3)).toBeVisible();
  const box = (await handle(3).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // dragging from the text does not start a drag
  const textC = page.getByRole('textbox', { name: 'Step 3' });
  const ta = (await textC.boundingBox())!;
  const a0 = (await page.getByRole('textbox', { name: 'Step 1' }).boundingBox())!;
  await page.mouse.move(ta.x + ta.width / 2, ta.y + ta.height / 2);
  await page.mouse.down();
  await page.mouse.move(a0.x + 20, a0.y + 10, { steps: 12 });
  await page.mouse.up();
  expect(await stepTexts(page)).toEqual(['A', 'B', 'C']);

  // drag C's handle above B
  await drag(page, handle(3), page.locator('li.step').nth(1));
  await expect.poll(() => stepTexts(page)).toEqual(['A', 'C', 'B']);
  await expectSaved(page);
  await page.reload();
  await expect.poll(() => stepTexts(page)).toEqual(['A', 'C', 'B']);

  // keyboard: B (now step 3) up -> A, B, C
  await handle(3).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('p.sr-only[aria-live="polite"]')).toHaveText('Step 3 moved to position 2');
  await expect(handle(2)).toBeFocused();
  await expectSaved(page);
  await page.reload();
  await expect.poll(() => stepTexts(page)).toEqual(['A', 'B', 'C']);
});

test('a long step keeps a correct textarea height after moving', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'reorderh');
  await createRecipe(page, { title: 'Tall pie', ingredients: ['flour'], steps: ['short', 'x'] });
  await page.getByRole('textbox', { name: 'Step 2' }).fill(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'));
  await expectSaved(page);
  const h = (n: number) => page.getByRole('textbox', { name: `Step ${n}` }).evaluate((e) => e.getBoundingClientRect().height);
  const tall = await h(2);
  expect(tall).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Reorder step 2' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => h(1)).toBeGreaterThan(150);
  expect(await h(2)).toBeLessThan(100);
  // still auto-grows after the move
  const before = await h(2);
  await page.getByRole('textbox', { name: 'Step 2' }).fill(Array.from({ length: 10 }, (_, i) => `more ${i}`).join('\n'));
  await expect.poll(() => h(2)).toBeGreaterThan(before + 80);
});
