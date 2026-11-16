import { Injectable, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { LANGS, startingLanguage } from './language';

@Injectable({ providedIn: 'root' })
class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

/** Starts in the language chosen in this browser (or the browser's own); a missing key shows the English text. */
export const provideAppTransloco = () =>
  provideTransloco({
    config: {
      availableLangs: [...LANGS],
      defaultLang: startingLanguage(),
      fallbackLang: 'en',
      missingHandler: { useFallbackTranslation: true },
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: HttpTranslocoLoader,
  });
