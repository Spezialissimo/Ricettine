import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { clearOverlays, settle } from '../../testing/spec-helpers';
import { DetailChipsComponent } from './detail-chips.component';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';

function mockMatchMedia(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) =>
      ({ matches: desktop && q === '(min-width: 768px)', media: q }) as MediaQueryList,
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
const chips = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button.chip')) as HTMLButtonElement[];

describe('DetailChipsComponent', () => {
  afterEach(() => {
    clearOverlays();
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
  });

  it('shows filled chips with values and dashed placeholders for missing ones', async () => {
    const { el } = await mount({ portions: 4, prepMinutes: 30, cookMinutes: null });
    const c = chips(el);
    expect(c.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Serves 4',
      'Prep 30m',
      en.editor.chips.addCook,
    ]);
    expect(c.map((b) => b.classList.contains('empty'))).toEqual([false, false, true]);
    c.forEach((b) => expect(b.getAttribute('aria-haspopup')).toBe('dialog'));
  });

  it('formats hours', async () => {
    const { el } = await mount({ prepMinutes: 90 });
    expect(chips(el)[1].textContent?.replace(/\s+/g, ' ').trim()).toBe('Prep 1h 30');
  });

  it('source is a plain labelled text field, not a chip; typing saves it, blank clears it', async () => {
    const { f, el, store } = await mount({
      source: 'https://example.com/a-very-long/recipe-link.html',
    });
    const input = el.querySelector('.source input') as HTMLInputElement;
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain(
      en.editor.sourceSheet.label,
    );
    expect(input.value).toBe('https://example.com/a-very-long/recipe-link.html');
    expect(input.placeholder).toBe(en.editor.sourcePlaceholder);
    input.value = 'Nonna';
    input.dispatchEvent(new Event('input'));
    await settle(f);
    expect(store.recipe().source).toBe('Nonna');
    input.value = '  ';
    input.dispatchEvent(new Event('input'));
    await settle(f);
    expect(store.recipe().source).toBeNull();
  });

  it('Cook time opens its own sheet (no tabs) as a centered dialog on desktop', async () => {
    mockMatchMedia(true);
    const { f, el } = await mount();
    chips(el)[2].click();
    await settle(f);
    const pane = document.querySelector('.cdk-overlay-pane') as HTMLElement;
    expect(pane.classList).toContain('editor-sheet');
    expect(pane.classList).toContain('editor-sheet--center');
    expect(pane.querySelector('h2')?.textContent).toContain(en.editor.time.cookTitle);
    expect(pane.querySelector('[role="tab"]')).toBeNull();
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
