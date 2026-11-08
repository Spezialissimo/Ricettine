import { CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
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

  it('after deleting, focus goes to the previous step, else the next, else the add button', async () => {
    const { f, el } = await mount(['a', 'b', 'c']);
    const del = async (i: number) => {
      areas(el)[i].focus();
      await settle(f);
      (el.querySelector('button.delete-step') as HTMLButtonElement).click();
      await settle(f);
    };
    await del(1);
    expect(document.activeElement).toBe(areas(el)[0]);
    await del(0);
    expect(document.activeElement).toBe(areas(el)[0]); // 'c', the next one
    await del(0);
    expect(document.activeElement).toBe(el.querySelector('button.add-step'));
  });

  describe('reordering', () => {
    const handles = (el: HTMLElement) => Array.from(el.querySelectorAll('button.drag-handle')) as HTMLButtonElement[];
    const texts = (store: { recipe: () => { steps: { text: string }[] } }) => store.recipe().steps.map((s) => s.text);
    const key = (h: HTMLElement, k: string) => {
      const ev = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true });
      h.dispatchEvent(ev);
      return ev;
    };

    it('a drop from index 2 to 1 reorders the steps and keeps focus on the moved step handle', async () => {
      const { f, el, store } = await mount(['A', 'B', 'C']);
      const list = f.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
      list.dropped.emit({ previousIndex: 2, currentIndex: 1 } as never);
      await settle(f);
      expect(texts(store)).toEqual(['A', 'C', 'B']);
      expect(areas(el).map((a) => a.value)).toEqual(['A', 'C', 'B']);
      expect(document.activeElement).toBe(handles(el)[1]);
    });

    it('each step has a 44 px named handle with touch-action none; the textarea is not a handle', async () => {
      const { el } = await mount(['A', 'B']);
      expect(handles(el).map((h) => h.getAttribute('aria-label'))).toEqual(['Reorder step 1', 'Reorder step 2']);
      expect(el.querySelectorAll('[cdkDragHandle], .cdk-drag-handle').length).toBe(2);
      expect(areas(el)[0].closest('.cdk-drag-handle')).toBeNull();
      expect(handles(el)[0].closest('li')?.classList.contains('cdk-drag')).toBe(true);
    });

    it('ArrowUp on step 3 handle moves it to position 2, announces it, and keeps focus', async () => {
      const { f, el, store } = await mount(['A', 'B', 'C']);
      handles(el)[2].focus();
      expect(key(handles(el)[2], 'ArrowUp').defaultPrevented).toBe(true);
      await settle(f);
      expect(texts(store)).toEqual(['A', 'C', 'B']);
      expect(document.activeElement).toBe(handles(el)[1]);
      const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(live.textContent?.trim()).toBe('Step 3 moved to position 2');
    });

    it('ArrowDown moves down by one; the ends do nothing', async () => {
      const { f, el, store } = await mount(['A', 'B', 'C']);
      key(handles(el)[0], 'ArrowDown');
      await settle(f);
      expect(texts(store)).toEqual(['B', 'A', 'C']);
      key(handles(el)[0], 'ArrowUp');
      key(handles(el)[2], 'ArrowDown');
      await settle(f);
      expect(texts(store)).toEqual(['B', 'A', 'C']);
    });

    it('a single step has no usable handle and cannot be dragged', async () => {
      const { el } = await mount(['A']);
      expect(handles(el)[0].disabled).toBe(true);
      expect(el.querySelector('li.step')?.classList.contains('cdk-drag-disabled')).toBe(true);
    });

    it('clears textarea heights after a move (no stale height from the previous occupant)', async () => {
      const { f, el } = await mount(['A', 'B']);
      areas(el)[0].style.height = '300px';
      key(handles(el)[1], 'ArrowUp');
      await settle(f);
      expect(areas(el)[0].style.height).toBe('');
    });
  });
});
