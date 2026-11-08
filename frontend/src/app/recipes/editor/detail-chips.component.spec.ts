import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { clearOverlays, settle } from '../../testing/spec-helpers';
import { DetailChipsComponent } from './detail-chips.component';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';

function mockMatchMedia(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: desktop && q === '(min-width: 768px)', media: q }) as MediaQueryList,
  });
}

async function mount(over = {}) {
  const store = fakeEditorStore(over);
  TestBed.configureTestingModule({
    providers: [provideTestTransloco(), { provide: EditorStore, useValue: store }],
  });
  const f = TestBed.createComponent(DetailChipsComponent);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, store };
}
const chips = (el: HTMLElement) => Array.from(el.querySelectorAll('button.chip')) as HTMLButtonElement[];

describe('DetailChipsComponent', () => {
  afterEach(() => {
    clearOverlays();
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
  });

  it('shows filled chips with values and dashed placeholders for missing ones', async () => {
    const { el } = await mount({ portions: 4, prepMinutes: 30, cookMinutes: null, source: 'Nonna' });
    const c = chips(el);
    expect(c.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Serves 4', 'Prep 30m', en.editor.chips.addCook, 'Nonna',
    ]);
    expect(c.map((b) => b.classList.contains('empty'))).toEqual([false, false, true, false]);
    c.forEach((b) => expect(b.getAttribute('aria-haspopup')).toBe('dialog'));
  });

  it('formats hours and shows every missing detail as a placeholder', async () => {
    const { el } = await mount({ prepMinutes: 90 });
    const text = chips(el).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(text).toEqual(['Serves 1', 'Prep 1h 30', en.editor.chips.addCook, en.editor.chips.addSource]);
  });

  it('opens the time sheet on the cook tab as a centered dialog on desktop', async () => {
    mockMatchMedia(true);
    const { f, el } = await mount();
    chips(el)[2].click();
    await settle(f);
    const pane = document.querySelector('.cdk-overlay-pane') as HTMLElement;
    expect(pane.classList).toContain('editor-sheet');
    expect(pane.classList).toContain('editor-sheet--center');
    const tab = Array.from(pane.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.trim() === en.editor.time.cook);
    expect(tab?.getAttribute('aria-selected')).toBe('true');
  });

  it('opens a bottom sheet on the phone', async () => {
    mockMatchMedia(false);
    const { f, el } = await mount();
    chips(el)[0].click();
    await settle(f);
    const pane = document.querySelector('.cdk-overlay-pane') as HTMLElement;
    expect(pane.classList).toContain('editor-sheet--bottom');
    expect(pane.querySelector('app-portions-sheet')).toBeTruthy();
  });
});
