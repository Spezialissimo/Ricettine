import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../public/i18n/en.json';
import it from '../../../public/i18n/it.json';

const FILES: Record<string, Translation> = { en, it };

@Injectable()
class TestLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of(FILES[lang]);
  }
}

/** Transloco with the real translation files; English unless a spec asks for another language. */
export const provideTestTransloco = (lang: 'en' | 'it' = 'en') =>
  provideTransloco({
    config: {
      availableLangs: ['en', 'it'],
      defaultLang: lang,
      fallbackLang: 'en',
      reRenderOnLangChange: true,
    },
    loader: TestLoader,
  });

export { en, it as itJson };
