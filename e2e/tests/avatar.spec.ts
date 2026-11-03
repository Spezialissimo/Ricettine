import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserContext, Page, expect, test } from '@playwright/test';
import exifr from 'exifr';
import { newUserPage } from './helpers';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'portrait-orientation6.jpg');

test('fixture is what it claims: landscape pixels, EXIF Orientation 6, GPS present', async () => {
  const exif = await exifr.parse(readFileSync(FIXTURE), { gps: true, tiff: true, translateValues: false });
  expect(exif.Orientation).toBe(6);
  expect(exif.latitude).toBeCloseTo(45.4667, 3);
  expect(exif.longitude).toBeCloseTo(9.1833, 3);
  // stored pixels are landscape
  expect(exif.ExifImageWidth).toBeGreaterThan(exif.ExifImageHeight);
});

test.describe.serial('avatar upload', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    ({ context, page } = await newUserPage(browser, testInfo, 'avatar'));
  });
  test.afterAll(async () => context.close());

  const avatar = () => page.getByRole('img', { name: 'Your avatar' });

  test('a portrait phone photo shows upright and is stripped of EXIF/GPS', async () => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await page.getByLabel('Choose photo').setInputFiles(FIXTURE);
    await expect(avatar()).toBeVisible();

    await expect
      .poll(() => avatar().evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight))
      .toBeGreaterThan(0);
    const dims = await avatar().evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight }));
    expect(dims.h).toBeGreaterThan(dims.w);
    expect(Math.max(dims.w, dims.h)).toBe(256);

    // Orientation 6 = rotate 90 deg clockwise: the stored top edge (red) ends up on the right.
    const sample = await avatar().evaluate((i: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = i.naturalWidth;
      c.height = i.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(i, 0, 0);
      const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
      return { left: px(10, c.height / 2), right: px(c.width - 10, c.height / 2) };
    });
    expect(sample.right[0]).toBeGreaterThan(200);
    expect(sample.right[2]).toBeLessThan(60);
    expect(sample.left[2]).toBeGreaterThan(200);
    expect(sample.left[0]).toBeLessThan(60);

    const src = new URL((await avatar().getAttribute('src'))!, page.url()).toString();
    expect(new URL(src).pathname).toMatch(/^\/media\/[^/]+\/avatar\.jpg$/);
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/jpeg');
    const bytes = await res.body();
    const latin = bytes.toString('latin1');
    expect(latin).not.toContain('Exif\0\0');
    expect(latin).not.toContain('GPS');
    const after = await exifr.parse(bytes, { gps: true, tiff: true }).catch(() => undefined);
    expect(after?.latitude).toBeUndefined();
    expect(after?.longitude).toBeUndefined();
  });

  test('Remove photo makes the avatar disappear', async () => {
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(avatar()).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  });
});
