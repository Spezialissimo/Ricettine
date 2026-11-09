import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component, Injectable } from '@angular/core';
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

  it('links the display name to the own profile', async () => {
    const el = await navFor(false);
    const who = el.querySelector('header a.who');
    expect(who?.getAttribute('href')).toBe('/u/ann');
    expect(who?.getAttribute('aria-label')).toBe('Your profile');
    expect(who?.textContent).toContain('Ann');
  });

  it('has a main nav, a bottom nav, a new-recipe action and a logout control', async () => {
    const el = await navFor(false);
    expect(el.querySelector('nav[aria-label="Main"] a[href="/recipes"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Main"] a[href="/recipes/new"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Sections"] a[href="/recipes"]')).toBeTruthy();
    expect(el.querySelector('nav[aria-label="Sections"] a[href="/settings/profile"]')).toBeTruthy();
    expect(el.querySelector('header a[aria-label="New recipe"][href="/recipes/new"]')).toBeTruthy();
    expect(el.querySelector('header button.logout')?.textContent).toContain('Log out');
  });

  it('renders Home first in both navs and the logo links home', async () => {
    const el = await navFor(false);
    for (const nav of ['Main', 'Sections']) {
      const first = el.querySelector(`nav[aria-label="${nav}"] a`) as HTMLAnchorElement;
      expect(first.getAttribute('href'), nav).toBe('/');
      expect(first.textContent, nav).toContain('Home');
    }
    expect(el.querySelector('header a.logo')?.getAttribute('href')).toBe('/');
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

  it('a failed logout keeps the user signed in, shows the network error, and the button retries', async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'Ann', avatarUrl: null, admin: false });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ShellComponent);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    (el.querySelector('button.logout') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'), { status: 0 });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    expect(TestBed.inject(AuthStore).me()).not.toBeNull();
    expect(nav).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.network_error);
    (el.querySelector('button.logout-retry') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'x' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('marks the link of the current section with aria-current="page"', async () => {
    @Component({ template: '' })
    class Blank {}
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideTestTransloco(),
        provideRouter([{ path: 'recipes', component: Blank }, { path: 'settings/profile', component: Blank }]),
      ],
    });
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'Ann', avatarUrl: null, admin: false });
    const f = TestBed.createComponent(ShellComponent);
    await TestBed.inject(Router).navigateByUrl('/recipes');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    for (const nav of ['Main', 'Sections']) {
      expect(el.querySelector(`nav[aria-label="${nav}"] a[href="/recipes"]`)?.getAttribute('aria-current'), nav).toBe('page');
      expect(el.querySelector(`nav[aria-label="${nav}"] a[href="/settings/profile"]`)?.hasAttribute('aria-current'), nav).toBe(false);
    }
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
