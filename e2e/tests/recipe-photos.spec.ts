import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Locator, Page, expect, test } from '@playwright/test';
import { createRecipe, newUserPage } from './helpers';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'portrait-orientation6.jpg');

/** Clicks a button that opens the file chooser and answers it with the fixture. */
async function pickFile(page: Page, button: Locator) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(FIXTURE);
}

/** Desktop drop: dragenter/dragover/drop with a DataTransfer carrying the fixture bytes. */
async function dropFile(target: Locator) {
  const b64 = readFileSync(FIXTURE).toString('base64');
  const dt = await target.page().evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'portrait.jpg', { type: 'image/jpeg' }));
    return transfer;
  }, b64);
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await expect(target).toHaveCSS('outline-style', 'dashed');
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await expect(target).not.toHaveCSS('outline-style', 'dashed');
}

test('cover and step photos: add, survive reload, remove, stay private', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'photos');
  const editorUrl = await createRecipe(page, { title: 'Photo pie', ingredients: ['flour'], steps: ['Mix', 'Bake'] });

  // cover
  await pickFile(page, page.getByRole('button', { name: 'Add cover photo' }));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();

  // step 2
  if (desktop) {
    await dropFile(page.locator('li.step').nth(1));
  } else {
    await page.getByRole('textbox', { name: 'Step 2' }).click();
    await pickFile(page, page.getByRole('button', { name: '📷 Photo' }));
  }
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 2"]')).toBeVisible();
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of step 1' })).toHaveCount(0);

  await page.reload();
  const cover = page.getByRole('img', { name: 'Cover photo' });
  const step2 = page.getByRole('img', { name: 'Photo of step 2' });
  await expect(cover).toBeVisible();
  await expect(step2).toBeVisible();
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalHeight > i.naturalWidth)).toBe(true);
  const coverUrl = (await cover.getAttribute('src'))!;

  // an anonymous visitor cannot fetch the cover
  const anon = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  expect((await anon.request.get(coverUrl)).status()).toBe(404);
  await anon.close();

  // remove the step photo
  await page.getByRole('button', { name: 'Remove photo of step 2' }).click();
  await expect(page.getByRole('status').getByText('Saved ✓')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Step 2' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of step 2' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Cover photo' })).toBeVisible();
  expect(page.url()).toBe(editorUrl);
});
