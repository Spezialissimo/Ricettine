import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { AuthStore } from '../core/auth.store';
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

  async function navFor(admin: boolean) {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'Ann', avatarUrl: null, admin });
    const f = TestBed.createComponent(ShellComponent);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('shows Settings for everyone and the display name', async () => {
    const el = await navFor(false);
    expect(el.querySelector('nav a[href="/settings/profile"]')).toBeTruthy();
    expect(el.querySelector('header')?.textContent).toContain('Ann');
  });

  it('hides admin links for non-admins', async () => {
    const el = await navFor(false);
    expect(el.querySelector('nav a[href^="/admin"]')).toBeNull();
  });

  it('shows admin link for admins', async () => {
    const el = await navFor(true);
    expect(el.querySelector('nav a[href^="/admin"]')).toBeTruthy();
  });
});

function provideTestTransloco() {
  return provideTransloco({
    config: { availableLangs: ['en'], defaultLang: 'en' },
    loader: TestLoader,
  });
}
