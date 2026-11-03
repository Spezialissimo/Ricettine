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

/** Lets pending HTTP continuations (microtasks) run, then waits for rendering to settle. */
export async function settle(f: { whenStable(): Promise<unknown> }): Promise<void> {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  await f.whenStable();
}
