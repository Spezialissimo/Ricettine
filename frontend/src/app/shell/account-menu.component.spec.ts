import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { pressEscape, settle } from '../testing/spec-helpers';
import { AccountMenuComponent } from './account-menu.component';
import { provideSite } from '../testing/site';

@Component({ template: '' })
class Blank {}

async function menu(opts: { admin?: boolean; avatarUrl?: string | null } = {}) {
  TestBed.configureTestingModule({
    imports: [AccountMenuComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTestTransloco(),
      provideRouter([{ path: '**', component: Blank }]),
    ],
  });
  TestBed.inject(AuthStore).setMe({
    id: '1',
    email: 'a@b.c',
    username: 'ann',
    displayName: 'Ann',
    avatarUrl: opts.avatarUrl ?? null,
    admin: opts.admin ?? false,
  });
  const f = TestBed.createComponent(AccountMenuComponent);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const trigger = el.querySelector('button.trigger') as HTMLButtonElement;
  const open = async () => {
    trigger.click();
    await f.whenStable();
  };
  return { f, el, trigger, open };
}

describe('AccountMenuComponent', () => {
  it('shows the name and the initial when there is no avatar, collapsed', async () => {
    const { el, trigger } = await menu();
    expect(trigger.textContent).toContain('Ann');
    expect(el.querySelector('app-avatar .initial')?.textContent?.trim()).toBe('A');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#account-panel')).toBeNull();
  });

  it('shows the avatar image when the user has one', async () => {
    const { el } = await menu({ avatarUrl: '/media/av/thumb.jpg' });
    expect(el.querySelector('app-avatar img')?.getAttribute('src')).toBe('/media/av/thumb.jpg');
  });

  it('opens a panel with View profile, Settings and Log out (no Admin for non-admins)', async () => {
    const { el, trigger, open } = await menu();
    await open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(el.querySelectorAll('#account-panel nav a'), (a) => [
      a.getAttribute('href'),
      a.textContent?.trim(),
    ]);
    expect(items).toEqual([
      ['/u/ann', en.nav.viewProfile],
      ['/settings/profile', en.nav.settings],
    ]);
    expect(el.querySelector('#account-panel button.logout')?.textContent).toContain(en.auth.logout);
  });

  it('shows Admin to admins, pointing into Settings', async () => {
    const { el, open } = await menu({ admin: true });
    await open();
    const admin = Array.from(el.querySelectorAll('#account-panel nav a')).find(
      (a) => a.textContent?.trim() === en.nav.admin,
    );
    expect(admin?.getAttribute('href')).toBe('/settings/admin/invites');
  });

  it('closes on Escape (focus back on the trigger), outside click, and navigation', async () => {
    const { f, el, trigger, open } = await menu();
    document.body.appendChild(el);
    await open();
    pressEscape(document.body);
    await f.whenStable();
    expect(el.querySelector('#account-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await open();
    document.body.click();
    await f.whenStable();
    expect(el.querySelector('#account-panel')).toBeNull();

    await open();
    (el.querySelector('#account-panel') as HTMLElement).click(); // a click inside keeps it open
    await f.whenStable();
    expect(el.querySelector('#account-panel')).not.toBeNull();
    await TestBed.inject(Router).navigateByUrl('/settings/profile');
    await f.whenStable();
    expect(el.querySelector('#account-panel')).toBeNull();
    el.remove();
  });

  it('logs out to /login', async () => {
    const { f, el, open } = await menu();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    await open();
    (el.querySelector('button.logout') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r)); // pending saves are flushed first (none here)
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'x' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
  });

  it('a failed logout keeps the user signed in and the panel open, with the error and Retry', async () => {
    const { f, el, open } = await menu();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    await open();
    (el.querySelector('button.logout') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'), { status: 0 });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).not.toBeNull();
    expect(nav).not.toHaveBeenCalled();
    const alert = el.querySelector('#account-panel [role="alert"]');
    expect(alert?.textContent).toContain(en.errors.network_error);

    (el.querySelector('button.logout-retry') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'x' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
  });
});

describe('AccountMenuComponent in the demo', () => {
  it('has no Log out', async () => {
    TestBed.configureTestingModule({
      imports: [AccountMenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTransloco(),
        provideRouter([{ path: '**', component: Blank }]),
        provideSite({ demo: true }),
      ],
    });
    TestBed.inject(AuthStore).setMe({
      id: '1',
      email: 'a@b.c',
      username: 'ospite',
      displayName: 'Ospite',
      avatarUrl: null,
      admin: false,
    });
    const f = TestBed.createComponent(AccountMenuComponent);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    (el.querySelector('button.trigger') as HTMLButtonElement).click();
    await f.whenStable();
    expect(el.querySelector('#account-panel')).not.toBeNull();
    expect(el.querySelector('button.logout')).toBeNull();
  });
});
