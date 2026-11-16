import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type Lang = 'en' | 'it';
export const LANGS: readonly Lang[] = ['en', 'it'];
export type LanguageChoice = 'system' | Lang;
export const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['system', 'en', 'it'];

/** Where the choice is kept: per browser, like the theme (an unreadable store falls back to System). */
const KEY = 'ricettine.lang';

/** The first browser language we ship wins (`it-CH` → it, `de, it` → it); none → English. */
export function browserLanguage(languages: readonly string[] = navigatorLanguages()): Lang {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if ((LANGS as readonly string[]).includes(primary)) return primary as Lang;
  }
  return 'en';
}

function navigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
}

export function storedChoice(): LanguageChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'it' ? v : 'system';
  } catch {
    return 'system';
  }
}

function store(choice: LanguageChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage unavailable (private mode, blocked): the choice holds for this visit only
  }
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** CLDR plural category of `n` in `lang` ('one', 'other', …); rule objects are cached per language. */
export function pluralCategory(n: number, lang: string): Intl.LDMLPluralRule {
  let rules = pluralRules.get(lang);
  if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang)));
  return rules.select(n);
}

export function resolve(choice: LanguageChoice): Lang {
  return choice === 'system' ? browserLanguage() : choice;
}

/**
 * Called while the app config is built, before Angular starts: the language Transloco starts with, also set on `<html lang>`,
 * so a reload never shows another language first.
 */
export function startingLanguage(): Lang {
  const lang = resolve(storedChoice());
  document.documentElement.lang = lang;
  return lang;
}

/**
 * The one place that knows the active language. `lang` is a signal so anything formatting with it
 * (dates, numbers, name lists, plurals) re-renders on a switch; read it instead of `getActiveLang()`.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly i18n = inject(TranslocoService);
  private readonly _choice = signal<LanguageChoice>(storedChoice());
  private readonly _lang = signal<Lang>(this.i18n.getActiveLang() as Lang);
  readonly choice = this._choice.asReadonly();
  readonly lang = this._lang.asReadonly();

  constructor() {
    const sub = this.i18n.langChanges$.subscribe((l) => {
      this._lang.set(l as Lang);
      document.documentElement.lang = l;
    });
    // With System chosen, follow the browser when its language list changes.
    const onChange = () => {
      if (this._choice() === 'system') this.i18n.setActiveLang(browserLanguage());
    };
    window.addEventListener('languagechange', onChange);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      window.removeEventListener('languagechange', onChange);
    });
  }

  /**
   * The key for a count: `<base>One` or `<base>Other`, by the active language's plural rules
   * (both languages we ship only need these two forms).
   */
  pluralKey(base: string, n: number): string {
    return pluralCategory(n, this.lang()) === 'one' ? `${base}One` : `${base}Other`;
  }

  choose(choice: LanguageChoice): void {
    this._choice.set(choice);
    store(choice);
    this.i18n.setActiveLang(resolve(choice));
  }
}
