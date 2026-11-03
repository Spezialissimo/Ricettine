import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { ShellComponent } from './shell.component';
import en from '../../../public/i18n/en.json';

@Injectable()
class TestLoader implements TranslocoLoader {
  getTranslation() {
    return of(en);
  }
}

describe('ShellComponent', () => {
  it('renders the app name from i18n and a bottom nav', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        provideTestTransloco(),
      ],
    });
    const f = TestBed.createComponent(ShellComponent);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('header')?.textContent).toContain('Ricettine');
    expect(el.querySelector('nav')).toBeTruthy();
  });
});

function provideTestTransloco() {
  return provideTransloco({
    config: { availableLangs: ['en'], defaultLang: 'en' },
    loader: TestLoader,
  });
}
