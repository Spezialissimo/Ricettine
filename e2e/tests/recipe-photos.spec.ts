import { readFileSync } from 'node:fs';
import { Locator, expect } from '@playwright/test';
import { FIXTURE_PHOTO, createRecipe, expectSaved, newContext, newUserPage, pickPhoto, revealPhotoActions, test } from '../helpers';

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
    await pickPhoto(page, page.getByRole('button', { name: 'Add photo to step 2' }));
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
  await revealPhotoActions(page, 'Photo of step 2', desktop);
  await page.getByRole('button', { name: 'Remove photo of step 2' }).click();
  await expectSaved(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Step 2' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of step 2' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Cover photo' })).toBeVisible();
  expect(page.url()).toBe(editorUrl);
});

test('dragging a photo over the editor labels the cover and every step; a missed drop keeps the editor', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'dragging files is a desktop gesture');
  const { page } = await newUserPage(browser, testInfo, 'dragmiss');
  const editorUrl = await createRecipe(page, { title: 'Drag soup', ingredients: ['salt'], steps: ['Mix', 'Bake'] });
  await expect(page.locator('.cover').getByText('or drag or paste a photo here')).toBeVisible();

  const b64 = readFileSync(FIXTURE_PHOTO).toString('base64');
  const dt = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'portrait.jpg', { type: 'image/jpeg' }));
    return transfer;
  }, b64);
  const notes = page.getByLabel('Notes');
  await notes.dispatchEvent('dragover', { dataTransfer: dt });
  for (const target of [page.locator('.cover'), page.locator('li.step').nth(0), page.locator('li.step').nth(1)]) {
    await expect(target).toHaveCSS('outline-style', 'dashed');
  }
  await expect(page.locator('.cover')).toHaveAttribute('data-drop-label', 'Drop photo here');

  // dropped next to the targets: no upload, still in the editor, and a hint where it goes
  await notes.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('status').filter({ hasText: 'Drop the photo on the cover or on a step.' })).toBeVisible();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.locator('img[src^="/media/"]')).toHaveCount(0);
  await expect(page.locator('.cover')).not.toHaveCSS('outline-style', 'dashed');

  // and on the cover it is taken
  await dropFile(page.locator('.cover'));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
});

test('the editor has no new-recipe action in the top bar; Save shows the recipe', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'editbars');
  await createRecipe(page, { title: 'Bare soup', steps: ['Boil'] });
  await expect(page.getByRole('link', { name: '+ New recipe' })).toHaveCount(0);
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  if (testInfo.project.name !== 'desktop') {
    // the editor's own bar sits on the screen edge
    await page.getByRole('textbox', { name: 'Step 1' }).click();
    const bar = (await page.locator('.bottom-bar').boundingBox())!;
    expect(Math.abs(bar.y + bar.height - page.viewportSize()!.height)).toBeLessThan(2);
  } else {
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/view$/); // a draft: its own page, with the draft banner
  if (testInfo.project.name === 'desktop') await expect(page.getByRole('link', { name: '+ New recipe' })).toBeVisible();
  else await expect(page.getByRole('banner').getByRole('button', { name: 'Menu' })).toBeVisible();
});

test('a real file drag (browser-level, as from Finder) sets the cover and a step photo', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'dragging files is a desktop gesture');
  const { page } = await newUserPage(browser, testInfo, 'realdrag');
  await createRecipe(page, { title: 'Real drag', ingredients: ['salt'], steps: ['Mix', 'Bake'] });
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [FIXTURE_PHOTO], dragOperationsMask: 1 };
  const dragTo = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(20, box.height / 2);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
  };
  await dragTo(page.locator('.cover'));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
  await dragTo(page.locator('li.step').nth(1));
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 2"]')).toBeVisible();
  await expectSaved(page);
});

test('pasting an image: into the step being written, otherwise as the cover', async ({ browser }, testInfo) => {
  const { page } = await newUserPage(browser, testInfo, 'paste');
  await createRecipe(page, { title: 'Paste pie', ingredients: ['flour'], steps: ['Mix', 'Bake'] });
  const b64 = readFileSync(FIXTURE_PHOTO).toString('base64');
  const paste = (selector: string) =>
    page.evaluate(
      ([data, sel]) => {
        const el = document.querySelector<HTMLElement>(sel)!;
        el.focus();
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'screenshot.jpg', { type: 'image/jpeg' }));
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      [b64, selector] as const,
    );
  await paste('li.step:nth-of-type(2) textarea');
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 2"]')).toBeVisible();
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toHaveCount(0);
  await expectSaved(page);
  await paste('#recipe-title');
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
  await expect(page.getByLabel('Title')).toHaveValue('Paste pie'); // the image did not end up as text
});

test('an image dragged out of a web page becomes the photo (the server downloads it)', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'dragging is a desktop gesture');
  const { page } = await newUserPage(browser, testInfo, 'webdrag');
  // a public image on "a web page": this user's avatar, which the app serves to anyone
  await page.goto('/settings/profile');
  await page.getByLabel('Choose photo').setInputFiles(FIXTURE_PHOTO);
  const avatarSrc = await page.getByRole('img', { name: 'Your avatar' }).getAttribute('src');
  const imageUrl = 'http://localhost:8080' + new URL(avatarSrc!, page.url()).pathname; // as the server sees itself

  await createRecipe(page, { title: 'Web drag', ingredients: ['salt'], steps: ['Mix', 'Bake'] });
  const cdp = await page.context().newCDPSession(page);
  const data = {
    // like Chrome when an <img> inside a link is dragged from another site: the link page and the image markup
    items: [
      { mimeType: 'text/uri-list', data: 'https://blog.example/some-post' },
      { mimeType: 'text/html', data: `<a href="https://blog.example/some-post"><img src="${imageUrl}"></a>` },
    ],
    dragOperationsMask: 1,
  };
  const dragTo = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(20, box.height / 2);
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
  };
  await dragTo(page.locator('li.step').nth(1));
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 2"]')).toBeVisible();
  await expectSaved(page);
  await dragTo(page.locator('.cover'));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
});

test('photo actions: the photo darkens with Replace and Remove centred, on hover or a tap', async ({ browser }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const { page } = await newUserPage(browser, testInfo, 'overlay');
  await createRecipe(page, { title: 'Overlay pie', ingredients: ['flour'], steps: ['Mix'] });
  await pickPhoto(page, page.getByRole('button', { name: 'Add photo to step 1' }));
  const img = page.locator('img[src^="/media/"][alt="Photo of step 1"]');
  await expect(img).toBeVisible();
  const actions = page.locator('li.step .on-photo-actions');
  const replace = actions.getByRole('button', { name: 'Replace photo of step 1' });
  const remove = actions.getByRole('button', { name: 'Remove photo of step 1' });
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS('opacity', '0');
  await revealPhotoActions(page, 'Photo of step 1', desktop);
  await expect(actions).toHaveCSS('opacity', '1');
  await expect(actions).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.45)'); // the photo darkens
  // centred on the photo, side by side, in the app's white icon-button style
  const photo = (await img.boundingBox())!;
  const r = (await replace.boundingBox())!;
  const d = (await remove.boundingBox())!;
  const middle = (r.x + d.x + d.width) / 2;
  expect(Math.abs(middle - (photo.x + photo.width / 2))).toBeLessThan(4);
  expect(Math.abs(r.y + r.height / 2 - (photo.y + photo.height / 2))).toBeLessThan(4);
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  for (const b of [r, d]) expect(b.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(img).toHaveCount(0);
  await expectSaved(page);
});
