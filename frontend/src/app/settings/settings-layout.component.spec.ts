import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { SettingsLayoutComponent } from './settings-layout.component';

@Component({ template: '' })
class Blank {}

async function layout(admin: boolean) {
  TestBed.configureTestingModule({
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
    avatarUrl: null,
    admin,
  });
  const f = TestBed.createComponent(SettingsLayoutComponent);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

const tabs = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('nav a'), (a) => [a.getAttribute('href'), a.textContent?.trim()]);

describe('SettingsLayoutComponent', () => {
  it('groups Profile, Appearance, Password and Delete account under Account; nothing else for non-admins', async () => {
    const { el } = await layout(false);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe(en.settings.tabs);
    const groups = el.querySelectorAll('nav [role="group"]');
    expect(groups.length).toBe(1);
    expect(groups[0].textContent).toContain(en.settings.groupAccount);
    expect(tabs(el)).toEqual([
      ['/settings/profile', en.settings.tabProfile],
      ['/settings/appearance', en.settings.tabAppearance],
      ['/settings/password', en.settings.tabPassword],
      ['/settings/delete', en.settings.tabDelete],
    ]);
  });

  it('adds an Administration group with Invites and Users for admins', async () => {
    const { f, el } = await layout(true);
    const admin = el.querySelectorAll('nav [role="group"]')[1] as HTMLElement;
    expect(admin.textContent).toContain(en.settings.groupAdmin);
    expect(
      Array.from(admin.querySelectorAll('a'), (a) => [
        a.getAttribute('href'),
        a.textContent?.trim(),
      ]),
    ).toEqual([
      ['/settings/admin/invites', en.settings.tabInvites],
      ['/settings/admin/users', en.settings.tabUsers],
    ]);
    await TestBed.inject(Router).navigateByUrl('/settings/admin/users');
    await f.whenStable();
    expect(el.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(
      '/settings/admin/users',
    );
  });
});
