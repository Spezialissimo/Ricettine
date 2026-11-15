import { join } from 'node:path';
import { Locator, Page, expect } from '@playwright/test';

/** A portrait JPEG with EXIF orientation 6 and GPS, for every photo upload. */
export const FIXTURE_PHOTO = join(import.meta.dirname, '..', 'fixtures', 'portrait-orientation6.jpg');

/** The editor's save indicator reads "Saved ✓". */
export const savedStatus = (page: Page) => page.getByRole('status').getByText('Saved ✓');
export const expectSaved = (page: Page) => expect(savedStatus(page)).toBeVisible();

/** Phone: opens the ☰ menu (a panel from the left, "Sections": Discover, My kitchen, New recipe) and returns it. */
export async function openDrawer(page: Page): Promise<Locator> {
  await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click();
  const drawer = page.getByRole('navigation', { name: 'Sections', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Goes to Discover or My kitchen: the top bar's links on desktop, the ☰ menu on the phone (no bottom bar). */
export async function navTo(page: Page, name: 'Discover' | 'My kitchen', project: string) {
  if (project === 'desktop') await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  else await (await openDrawer(page)).getByRole('link', { name, exact: true }).click();
}

/** Starts a new recipe: the "+ New recipe" pill on desktop, "New recipe" in the ☰ menu on the phone. */
export async function clickNewRecipe(page: Page, project: string) {
  if (project === 'desktop') await page.getByRole('link', { name: '+ New recipe' }).click();
  else await (await openDrawer(page)).getByRole('link', { name: 'New recipe', exact: true }).click();
}

/**
 * A recipe page action (Share, Add to cookbook, Edit): the buttons in the header card on desktop, the photo's
 * ⋯ menu on the phone.
 */
export async function recipeAction(page: Page, name: 'Share' | 'Add to cookbook' | 'Edit', project: string) {
  if (project === 'desktop') {
    const actions = page.locator('.recipe-head .actions');
    await actions.getByRole(name === 'Edit' ? 'link' : 'button', { name, exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
}

/** Opens a recipe page's Share sheet and returns it (its link is in `[data-url]`). */
export async function openRecipeShare(page: Page, project: string): Promise<Locator> {
  await recipeAction(page, 'Share', project);
  const sheet = page.getByRole('dialog', { name: 'Share this recipe' });
  await expect(sheet.locator('[data-url]')).toBeVisible();
  return sheet;
}

/** The link shown in a share sheet or a copy-link box. */
export const linkIn = async (box: Locator) => (await box.locator('[data-url]').innerText()).trim();

/**
 * Opens the account menu (the avatar and name in the top bar) and returns its panel, which holds
 * View profile, Settings, Admin (admins) and Log out. Leaves it open if it already is.
 */
export async function openAccountMenu(page: Page): Promise<Locator> {
  const trigger = page.getByRole('banner').locator('app-account-menu button.trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const panel = page.locator('#account-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens a page of the account menu by its link name ("View profile", "Settings", "Admin"). */
export async function accountMenuLink(page: Page, name: string) {
  await (await openAccountMenu(page)).getByRole('link', { name, exact: true }).click();
}

/**
 * Shows a photo's Replace / Remove buttons: hover on desktop (the overlay then covers the photo), a tap on
 * the photo on the phone (no hover there).
 */
export async function revealPhotoActions(page: Page, alt: string, desktop: boolean) {
  const img = page.locator(`img[alt="${alt}"]`);
  if (desktop) await page.locator('.frame', { has: img }).hover();
  else await img.click();
}

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

/** The "Add photo to step 1" camera button, in the step itself on both layouts. */
export async function stepPhotoButton(page: Page, _desktop: boolean): Promise<Locator> {
  return page.getByRole('button', { name: 'Add photo to step 1' }).first();
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

/** Opens a new recipe and leaves it untouched with Save: an empty draft is deleted, `remaining` recipes stay listed. */
export async function leaveUntouchedDraft(page: Page, project: string, remaining: number) {
  await clickNewRecipe(page, project);
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel('Title')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/kitchen\/recipes$/);
  await expect(page.locator('a.recipe')).toHaveCount(remaining);
}
