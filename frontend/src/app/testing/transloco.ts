import { Injectable } from '@angular/core';
import { TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../public/i18n/en.json';

@Injectable()
class TestLoader implements TranslocoLoader {
  getTranslation() {
    return of(en);
  }
}

export const provideTestTransloco = () =>
  provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' }, loader: TestLoader });

export { en };
