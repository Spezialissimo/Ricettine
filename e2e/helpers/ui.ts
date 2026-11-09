import { join } from 'node:path';
import { Locator, Page, expect } from '@playwright/test';

/** A portrait JPEG with EXIF orientation 6 and GPS, for every photo upload. */
export const FIXTURE_PHOTO = join(import.meta.dirname, '..', 'fixtures', 'portrait-orientation6.jpg');

/** The editor's save indicator reads "Saved ✓". */
export const savedStatus = (page: Page) => page.getByRole('status').getByText('Saved ✓');
export const expectSaved = (page: Page) => expect(savedStatus(page)).toBeVisible();

/** The "new recipe" link of the recipes page: "+ New recipe" on desktop, "New recipe" in the phone's bar. */
export const newRecipeLink = (page: Page, project: string) =>
  project === 'desktop'
    ? page.getByRole('link', { name: '+ New recipe' })
    : page.getByRole('link', { name: 'New recipe', exact: true });

/** Clicks a button that opens the file chooser and answers it with the fixture photo. */
export async function pickPhoto(page: Page, button: Locator) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(FIXTURE_PHOTO);
}

/** In the editor: adds the cover photo and waits until it shows and is saved. */
export async function addCoverPhoto(page: Page) {
  await pickPhoto(page, page.getByRole('button', { name: 'Add cover photo' }));
  await expect(page.locator('img[src^="/media/"][alt="Cover photo"]')).toBeVisible();
  await expectSaved(page);
}

/** The "Add photo to step 1" button: on desktop the step's own, on the phone the bottom bar's (shown while the step has focus). */
export async function stepPhotoButton(page: Page, desktop: boolean): Promise<Locator> {
  if (desktop) return page.getByRole('button', { name: 'Add photo to step 1' }).first();
  await page.getByRole('textbox', { name: 'Step 1' }).click();
  return page.locator('.bottom-bar').getByRole('button', { name: 'Add photo to step 1' });
}

/** In the editor: adds a photo to step 1 and waits until it shows and is saved. */
export async function addStepPhoto(page: Page, desktop: boolean) {
  await pickPhoto(page, await stepPhotoButton(page, desktop));
  await expect(page.locator('img[src^="/media/"][alt="Photo of step 1"]')).toBeVisible();
  await expectSaved(page);
}

/**
 * Cards of a list sit side by side on desktop and stack on the phone. Compares the first two,
 * so the list needs at least two entries.
 */
export async function expectCardLayout(cards: Locator, project: string) {
  await expect(cards.nth(1)).toBeVisible();
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  if (project === 'desktop') {
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
  } else {
    expect(second.x).toBe(first.x);
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
  }
}

/** Opens a new recipe and leaves it untouched with Done: an empty draft is deleted, `remaining` recipes stay listed. */
export async function leaveUntouchedDraft(page: Page, project: string, remaining: number) {
  await newRecipeLink(page, project).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Title')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.locator('a.recipe')).toHaveCount(remaining);
}
