import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { clearOverlays, settle } from '../testing/spec-helpers';
import { CookbookFormDialog, CookbookFormData } from './cookbook-form.dialog';

async function open(data: CookbookFormData) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  const ref = TestBed.inject(Dialog).open(CookbookFormDialog, { data });
  const f = { whenStable: () => Promise.resolve() };
  await settle(f);
  const ov = document.querySelector('.cdk-overlay-container') as HTMLElement;
  return { ref, ov, f };
}
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};

describe('CookbookFormDialog', () => {
  afterEach(clearOverlays);

  it('blocks a blank name client-side and does not submit', async () => {
    const submit = vi.fn();
    const { ov, f } = await open({ submit });
    type(ov.querySelector('input[type="text"]')!, '   ');
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(submit).not.toHaveBeenCalled();
    expect(ov.querySelector('.field-error')?.textContent).toContain(en.errors.field.required);
  });

  it('counts code points: 100 emoji are fine, 101 are too long', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const { ov, f } = await open({ submit });
    const name = ov.querySelector('input[type="text"]') as HTMLInputElement;
    type(name, '\u{1F370}'.repeat(101));
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(submit).not.toHaveBeenCalled();
    expect(ov.querySelector('.field-error')?.textContent).toContain(en.errors.field.too_long);
    type(name, '\u{1F370}'.repeat(100));
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('submits trimmed values, an empty description as null, and closes with the result', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const { ov, f, ref } = await open({ submit });
    const closed = vi.fn();
    ref.closed.subscribe(closed);
    type(ov.querySelector('input[type="text"]')!, '  Desserts ');
    ov.querySelector<HTMLInputElement>('input[type="radio"][value="PUBLIC"]')!.click();
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(submit).toHaveBeenCalledWith({ name: 'Desserts', description: null, visibility: 'PUBLIC' });
    expect(closed).toHaveBeenCalledWith(true);
  });

  it('prefills when editing and maps a server field error to its message', async () => {
    const submit = vi.fn().mockRejectedValue(
      new HttpErrorResponse({ status: 400, error: { code: 'validation_failed', fields: { name: 'too_long' } } }),
    );
    const { ov, f } = await open({ initial: { name: 'Old', description: 'D', visibility: 'PUBLIC' }, submit });
    expect(ov.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Old');
    expect(ov.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('D');
    expect(ov.querySelector<HTMLInputElement>('input[type="radio"][value="PUBLIC"]')!.checked).toBe(true);
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(ov.querySelector('.field-error')?.textContent).toContain(en.errors.field.too_long);
  });
});
