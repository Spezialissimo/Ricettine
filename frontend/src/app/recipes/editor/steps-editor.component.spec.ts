import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';
import { StepsEditorComponent } from './steps-editor.component';

async function mount(texts: string[] = [], status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  const store = fakeEditorStore({ steps: texts.map((text) => ({ text, photoMediaId: null })) }, status);
  TestBed.configureTestingModule({
    providers: [provideTestTransloco(), { provide: EditorStore, useValue: store }],
  });
  const f = TestBed.createComponent(StepsEditorComponent);
  document.body.appendChild(f.nativeElement);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, store };
}
const areas = (el: HTMLElement) => Array.from(el.querySelectorAll('textarea')) as HTMLTextAreaElement[];
const type = (el: HTMLTextAreaElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input'));
};

describe('StepsEditorComponent', () => {
  afterEach(() => document.querySelectorAll('app-steps-editor').forEach((e) => e.remove()));

  it('renders numbered steps with textareas and edits their text', async () => {
    const { f, el, store } = await mount(['Boil', 'Serve']);
    expect(Array.from(el.querySelectorAll('.step-number')).map((n) => n.textContent?.trim())).toEqual(['1', '2']);
    type(areas(el)[1], 'Serve hot');
    await settle(f);
    expect(store.recipe().steps.map((s) => s.text)).toEqual(['Boil', 'Serve hot']);
    expect(areas(el)[0].maxLength).toBe(5000);
  });

  it('addStep() appends a step and focuses it', async () => {
    const { f, el, store } = await mount(['Boil']);
    f.componentInstance.addStep();
    await settle(f);
    expect(store.recipe().steps.length).toBe(2);
    expect(document.activeElement).toBe(areas(el)[1]);
  });

  it('the inline "+ Add step" button adds and focuses', async () => {
    const { f, el, store } = await mount();
    (el.querySelector('button.add-step') as HTMLButtonElement).click();
    await settle(f);
    expect(store.recipe().steps.length).toBe(1);
    expect(document.activeElement).toBe(areas(el)[0]);
  });

  it('Ctrl+Enter and Cmd+Enter in a step add the next step after it and focus it', async () => {
    const { f, el, store } = await mount(['one', 'three']);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      const first = areas(el)[0];
      first.focus();
      const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true, ...mod });
      first.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      await settle(f);
      expect(document.activeElement).toBe(areas(el)[1]);
    }
    expect(store.recipe().steps.map((s) => s.text)).toEqual(['one', '', '', 'three']);
  });

  it('plain Enter is left alone', async () => {
    const { el, store } = await mount(['one']);
    const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    areas(el)[0].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(store.recipe().steps.length).toBe(1);
  });

  it('tapping a step reveals its delete action, which removes it', async () => {
    const { f, el, store } = await mount(['a', 'b']);
    expect(el.querySelector('button.delete-step')).toBeNull();
    areas(el)[0].focus();
    await settle(f);
    (el.querySelector('button.delete-step') as HTMLButtonElement).click();
    await settle(f);
    expect(store.recipe().steps.map((s) => s.text)).toEqual(['b']);
  });

  it('on a published recipe, the last counting step cannot be deleted (hint shown); blank steps do not count', async () => {
    const { f, el } = await mount(['Boil', '  '], 'PUBLISHED');
    areas(el)[0].focus();
    await settle(f);
    const del = el.querySelector('button.delete-step') as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(el.textContent).toContain(en.editor.needsOne);
    areas(el)[1].focus();
    await settle(f);
    expect((el.querySelector('button.delete-step') as HTMLButtonElement).disabled).toBe(false);
  });
});
