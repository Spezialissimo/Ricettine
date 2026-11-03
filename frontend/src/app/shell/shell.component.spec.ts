import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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

  it('has a main nav, a bottom nav, a new-recipe action and a logout control', async () => {
    const el = await navFor(false);
    expect(el.querySelector('nav[aria-label="Main"] a[href="/recipes"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Main"] a[href="/recipes/new"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Bottom"] a[href="/recipes"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Bottom"] a[href="/settings/profile"]')).toBeTruthy();
    expect(el.querySelector('header a[aria-label="New recipe"][href="/recipes/new"]')).toBeTruthy();
    expect(el.querySelector('header button.logout')?.textContent).toContain('Log out');
  });

  it('logs out to /login', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'Ann', avatarUrl: null, admin: false });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ShellComponent);
    await f.whenStable();
    (f.nativeElement.querySelector('button.logout') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r)); // pending saves are flushed first (none here)
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'x' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
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
