import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';
import { PortionsSheetComponent } from './portions-sheet.component';

async function mount(portions: number) {
  const store = fakeEditorStore({ portions });
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideTestTransloco(),
      { provide: EditorStore, useValue: store },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const f = TestBed.createComponent(PortionsSheetComponent);
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  const minus = el.querySelector(
    `button[aria-label="${en.editor.portions.decrease}"]`,
  ) as HTMLButtonElement;
  const plus = el.querySelector(
    `button[aria-label="${en.editor.portions.increase}"]`,
  ) as HTMLButtonElement;
  return { f, el, store, close, minus, plus };
}

describe('PortionsSheetComponent', () => {
  it('steps up and down', async () => {
    const { f, el, store, minus, plus } = await mount(4);
    plus.click();
    await settle(f);
    expect(store.recipe().portions).toBe(5);
    expect(el.querySelector('output')?.textContent?.trim()).toBe('5');
    minus.click();
    minus.click();
    await settle(f);
    expect(store.recipe().portions).toBe(3);
  });

  it('does not go below 1', async () => {
    const { f, store, minus } = await mount(1);
    expect(minus.disabled).toBe(true);
    minus.click();
    await settle(f);
    expect(store.recipe().portions).toBe(1);
  });

  it('does not go above 100', async () => {
    const { f, store, plus } = await mount(99);
    plus.click();
    await settle(f);
    expect(store.recipe().portions).toBe(100);
    expect(plus.disabled).toBe(true);
    plus.click();
    await settle(f);
    expect(store.recipe().portions).toBe(100);
  });

  it('Done closes the sheet', async () => {
    const { el, close } = await mount(2);
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === en.editor.sheetDone)!
      .click();
    expect(close).toHaveBeenCalled();
  });
});
