import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';
import { TimeSheetComponent } from './time-sheet.component';

async function mount(tab: 'prep' | 'cook', over = {}) {
  const store = fakeEditorStore(over);
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideTestTransloco(),
      { provide: EditorStore, useValue: store },
      { provide: DIALOG_DATA, useValue: { tab } },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const f = TestBed.createComponent(TimeSheetComponent);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, store, close };
}
const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('TimeSheetComponent', () => {
  it('preset 30m sets prepMinutes to 30 immediately', async () => {
    const { f, el, store } = await mount('prep');
    button(el, '30m').click();
    await settle(f);
    expect(store.recipe().prepMinutes).toBe(30);
    expect(store.recipe().cookMinutes).toBeNull();
    expect(button(el, '30m').getAttribute('aria-pressed')).toBe('true');
  });

  it('custom 1 h 20 min sets 80 minutes', async () => {
    const { f, el, store } = await mount('prep');
    const hours = el.querySelector('input[name="hours"]') as HTMLInputElement;
    const minutes = el.querySelector('input[name="minutes"]') as HTMLInputElement;
    expect(el.querySelector(`label[for="${hours.id}"]`)?.textContent).toContain(en.editor.time.hours);
    type(hours, '1');
    type(minutes, '20');
    await settle(f);
    expect(store.recipe().prepMinutes).toBe(80);
  });

  it('has a tab per time; the Cook tab edits cookMinutes', async () => {
    const { f, el, store } = await mount('prep', { prepMinutes: 15 });
    const tabs = Array.from(el.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([en.editor.time.prep, en.editor.time.cook]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    tabs[1].click();
    await settle(f);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    button(el, '1h 30').click();
    await settle(f);
    expect(store.recipe().cookMinutes).toBe(90);
    expect(store.recipe().prepMinutes).toBe(15);
  });

  it('opens on the requested tab, clears a time, and Done closes', async () => {
    const { f, el, store, close } = await mount('cook', { cookMinutes: 45 });
    expect((el.querySelector('input[name="hours"]') as HTMLInputElement).value).toBe('0');
    expect((el.querySelector('input[name="minutes"]') as HTMLInputElement).value).toBe('45');
    button(el, en.editor.time.clear).click();
    await settle(f);
    expect(store.recipe().cookMinutes).toBeNull();
    button(el, en.editor.sheetDone).click();
    expect(close).toHaveBeenCalled();
  });

  it('clamps custom times to 0-10080 minutes', async () => {
    const { f, el, store } = await mount('prep');
    type(el.querySelector('input[name="hours"]') as HTMLInputElement, '500');
    await settle(f);
    expect(store.recipe().prepMinutes).toBe(10080);
  });
});
