import { Injectable, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

const translocoConfig = {
  availableLangs: ['en'],
  defaultLang: 'en',
  reRenderOnLangChange: true,
  prodMode: !isDevMode(),
};

export const provideAppTransloco = () =>
  provideTransloco({ config: translocoConfig, loader: HttpTranslocoLoader });
