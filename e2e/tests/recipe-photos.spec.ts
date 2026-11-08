import { readFileSync } from 'node:fs';
import { Locator, expect } from '@playwright/test';
import { FIXTURE_PHOTO, createRecipe, pickPhoto, expectSaved, newContext, newUserPage, test } from '../helpers';

/** Desktop drop: dragenter/dragover/drop with a DataTransfer carrying the fixture bytes. */
async function dropFile(target: Locator) {
  const b64 = readFileSync(FIXTURE_PHOTO).toString('base64');
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
  await pickPhoto(page, page.getByRole('button', { name: 'Add cover photo' }));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);

  // step 2
  if (desktop) {
    await dropFile(page.locator('li.step').nth(1));
  } else {
    await page.getByRole('textbox', { name: 'Step 2' }).click();
    await pickPhoto(page, page.locator('.bottom-bar').getByRole('button', { name: 'Add photo to step 2' }));
  }
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 2"]')).toBeVisible();
  await expectSaved(page);
  await expect(page.getByRole('img', { name: 'Photo of step 1' })).toHaveCount(0);

  await page.reload();
  const cover = page.getByRole('img', { name: 'Cover photo' });
  const step2 = page.getByRole('img', { name: 'Photo of step 2' });
  await expect(cover).toBeVisible();
  await expect(step2).toBeVisible();
  await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalHeight > i.naturalWidth)).toBe(true);
  const coverUrl = (await cover.getAttribute('src'))!;

  // an anonymous visitor cannot fetch the cover
  const anon = await newContext(browser, testInfo);
  expect((await anon.request.get(coverUrl)).status()).toBe(404);
  await anon.close();

  // remove the step photo
  await page.getByRole('button', { name: 'Remove photo of step 2' }).click();
  await expectSaved(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Step 2' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of step 2' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Cover photo' })).toBeVisible();
  expect(page.url()).toBe(editorUrl);
});
