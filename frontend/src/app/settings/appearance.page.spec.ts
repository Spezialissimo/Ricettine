import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { AppearancePage } from './appearance.page';

describe('AppearancePage', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  async function page() {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    const f = TestBed.createComponent(AppearancePage);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('offers System, Light and Dark with hints; System is checked by default', async () => {
    const { el } = await page();
    expect(el.querySelector('h1')?.textContent).toContain(en.settings.appearanceTitle);
    const labels = Array.from(el.querySelectorAll('label.theme'), (l) => l.textContent);
    expect(labels.length).toBe(3);
    expect(labels[0]).toContain(en.settings.theme.system);
    expect(labels[0]).toContain(en.settings.theme.systemHint);
    expect(labels[1]).toContain(en.settings.theme.light);
    expect(labels[2]).toContain(en.settings.theme.dark);
    const checked = el.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe('system');
    expect(el.textContent).toContain(en.settings.themeNote);
  });

  it('choosing Dark applies it at once and keeps it', async () => {
    const { f, el } = await page();
    const dark = el.querySelector<HTMLInputElement>('input[value="dark"]')!;
    dark.click();
    await f.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ricettine.theme')).toBe('dark');
    expect(el.querySelector<HTMLInputElement>('input:checked')?.value).toBe('dark');
  });
});
