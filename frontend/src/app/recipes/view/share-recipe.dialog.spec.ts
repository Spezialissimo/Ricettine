import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, clearOverlays, overlay, settle } from '../../testing/spec-helpers';
import { ShareRecipeData, ShareRecipeDialog } from './share-recipe.dialog';

async function mount(data: ShareRecipeData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideTestTransloco(),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const f = TestBed.createComponent(ShareRecipeDialog);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, close };
}
const url = (el: HTMLElement) => el.querySelector('[data-url]')?.textContent?.trim();

describe('ShareRecipeDialog', () => {
  afterEach(clearOverlays);

  it('shows the link to copy, with the recipe title and hint by default, and Done closes', async () => {
    const { el, close } = await mount({ url: 'https://x.test/r/AAA' });
    expect(el.querySelector('h2')?.textContent).toContain(en.recipes.shareTitle);
    expect(el.textContent).toContain(en.recipes.shareHint);
    expect(url(el)).toBe('https://x.test/r/AAA');
    expect(btn(el, en.common.copy)).toBeTruthy();
    btn(el, en.editor.sheetDone)!.click();
    expect(close).toHaveBeenCalled();
  });

  it('offers Reset link only when a reset is provided', async () => {
    const { el } = await mount({ url: 'https://x.test/r/AAA' });
    expect(btn(el, en.editor.resetLink)).toBeUndefined();
  });

  it('Reset asks first; confirmed, it shows the new link and says so', async () => {
    const reset = vi.fn().mockResolvedValue('https://x.test/r/BBB');
    const { f, el } = await mount({ url: 'https://x.test/r/AAA', reset });
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.editor.resetLinkConfirm.title);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(url(el)).toBe('https://x.test/r/BBB');
    expect(el.querySelector('[role="status"]')?.textContent).toContain(en.editor.linkReset);
  });

  it('Cancel in the confirmation keeps the link', async () => {
    const reset = vi.fn();
    const { f, el } = await mount({ url: 'https://x.test/r/AAA', reset });
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.common.cancel)!.click();
    await settle(f);
    expect(reset).not.toHaveBeenCalled();
    expect(url(el)).toBe('https://x.test/r/AAA');
  });

  it('a failed reset shows the error and keeps the old link', async () => {
    const reset = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const { f, el } = await mount({ url: 'https://x.test/r/AAA', reset });
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.network_error);
    expect(url(el)).toBe('https://x.test/r/AAA');
  });

  it('takes the cookbook wording when given', async () => {
    const reset = vi.fn();
    const { el } = await mount({
      url: 'https://x.test/c/AAA',
      reset,
      titleKey: 'cookbooks.shareSheetTitle',
      hintKey: 'cookbooks.shareHint',
      resetKey: 'cookbooks.resetLink',
    });
    expect(el.querySelector('h2')?.textContent).toContain(en.cookbooks.shareSheetTitle);
    expect(el.textContent).toContain(en.cookbooks.shareHint);
    expect(btn(el, en.cookbooks.resetLink)).toBeTruthy();
  });
});
