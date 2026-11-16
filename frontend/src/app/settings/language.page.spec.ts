import { TestBed } from '@angular/core/testing';
import { en, itJson, provideTestTransloco } from '../testing/transloco';
import { LanguagePage } from './language.page';

describe('LanguagePage', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    vi.restoreAllMocks();
  });

  async function page() {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-IT']);
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    const f = TestBed.createComponent(LanguagePage);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('offers System (naming the browser language), English and Italiano; System is checked by default', async () => {
    const { el } = await page();
    expect(el.querySelector('h1')?.textContent).toContain(en.settings.languageTitle);
    const labels = Array.from(el.querySelectorAll('label.choice'), (l) => l.textContent);
    expect(labels.length).toBe(3);
    expect(labels[0]).toContain(en.settings.language.system);
    expect(labels[0]).toContain('Follow this browser: Italiano');
    expect(labels[1]).toContain('English');
    expect(labels[2]).toContain('Italiano');
    expect(el.querySelector('[data-language-option="it"] .name')?.getAttribute('lang')).toBe('it');
    expect(el.querySelector<HTMLInputElement>('input:checked')?.value).toBe('system');
    expect(el.textContent).toContain(en.settings.languageNote);
  });

  it('choosing Italiano switches the page at once and keeps the choice', async () => {
    const { f, el } = await page();
    el.querySelector<HTMLInputElement>('input[value="it"]')!.click();
    await f.whenStable();
    expect(el.querySelector('h1')?.textContent).toContain(itJson.settings.languageTitle);
    expect(localStorage.getItem('ricettine.lang')).toBe('it');
    expect(document.documentElement.lang).toBe('it');
    expect(el.querySelector<HTMLInputElement>('input:checked')?.value).toBe('it');
  });
});
