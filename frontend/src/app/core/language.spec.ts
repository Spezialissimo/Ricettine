import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestTransloco } from '../testing/transloco';
import {
  LanguageService,
  browserLanguage,
  pluralCategory,
  startingLanguage,
  storedChoice,
} from './language';

const html = () => document.documentElement;

function setNavigatorLanguages(langs: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);
}

describe('language', () => {
  afterEach(() => {
    localStorage.clear();
    html().lang = 'en';
    vi.restoreAllMocks();
  });

  it.each([
    [['it-IT', 'en'], 'it'],
    [['it-CH'], 'it'],
    [['de-DE', 'it'], 'it'],
    [['en-GB', 'it'], 'en'],
    [['fr-FR'], 'en'],
    [[], 'en'],
  ])('the browser languages %j give %s', (langs, expected) => {
    expect(browserLanguage(langs)).toBe(expected);
  });

  it('starts in the browser language, and a stored choice beats it', () => {
    setNavigatorLanguages(['it-IT']);
    expect(startingLanguage()).toBe('it');
    expect(html().lang).toBe('it');
    localStorage.setItem('ricettine.lang', 'en');
    expect(startingLanguage()).toBe('en');
    expect(html().lang).toBe('en');
  });

  it('ignores junk and unreadable storage (System)', () => {
    localStorage.setItem('ricettine.lang', 'klingon');
    expect(storedChoice()).toBe('system');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(storedChoice()).toBe('system');
  });

  it('choosing switches at once and is kept; System forgets it and follows the browser', async () => {
    setNavigatorLanguages(['it-IT']);
    TestBed.configureTestingModule({ providers: [provideTestTransloco('en')] });
    const language = TestBed.inject(LanguageService);
    const i18n = TestBed.inject(TranslocoService);

    language.choose('it');
    expect(i18n.getActiveLang()).toBe('it');
    expect(language.lang()).toBe('it');
    expect(html().lang).toBe('it');
    expect(localStorage.getItem('ricettine.lang')).toBe('it');

    language.choose('en');
    expect(language.lang()).toBe('en');
    expect(language.choice()).toBe('en');

    language.choose('system');
    expect(localStorage.getItem('ricettine.lang')).toBeNull();
    expect(language.lang()).toBe('it');
  });

  it('picks the plural key by the active language', () => {
    TestBed.configureTestingModule({ providers: [provideTestTransloco('it')] });
    const language = TestBed.inject(LanguageService);
    expect(language.pluralKey('cookbooks.recipeCount', 1)).toBe('cookbooks.recipeCountOne');
    expect(language.pluralKey('cookbooks.recipeCount', 0)).toBe('cookbooks.recipeCountOther');
    expect(language.pluralKey('cookbooks.recipeCount', 12)).toBe('cookbooks.recipeCountOther');
    expect(pluralCategory(1, 'en')).toBe('one');
  });
});
