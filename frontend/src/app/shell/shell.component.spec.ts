import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class Blank {}

async function shell(admin = false) {
  TestBed.configureTestingModule({
    imports: [ShellComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTestTransloco(),
      provideRouter([
        { path: '', component: Blank },
        { path: 'kitchen', component: Blank, children: [{ path: 'recipes', component: Blank }] },
        { path: 'recipes/:id/edit', component: Blank, data: { editor: true } },
      ]),
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
  const f = TestBed.createComponent(ShellComponent);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('ShellComponent', () => {
  it('is the shared top bar and the page; there is no bottom navigation', async () => {
    const { el } = await shell();
    expect(el.querySelector('app-top-bar header.topbar')).not.toBeNull();
    expect(el.querySelector('main router-outlet')).not.toBeNull();
    expect(el.querySelector('nav.bottom-nav')).toBeNull();
    expect(el.querySelector('app-bottom-nav')).toBeNull();
  });

  it('has no Settings, Admin or Log out in the bar; they live in the account menu', async () => {
    const { el } = await shell(true);
    const navText = Array.from(el.querySelectorAll('nav'), (n) => n.textContent).join(' ');
    expect(navText).not.toContain(en.nav.settings);
    expect(navText).not.toContain(en.nav.admin);
    expect(el.querySelector('header app-account-menu button')?.textContent).toContain('Ann');
  });

  it('in the editor: no new-recipe action in the bar; it comes back after', async () => {
    const { f, el } = await shell();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/recipes/r1/edit');
    await f.whenStable();
    expect(el.querySelector('header a.new')).toBeNull();
    expect(el.classList.contains('editing')).toBe(true);
    expect(el.querySelector(`nav[aria-label="${en.nav.main}"]`)).not.toBeNull(); // desktop nav stays

    await router.navigateByUrl('/kitchen');
    await f.whenStable();
    expect(el.querySelector('header a.new')?.getAttribute('href')).toBe('/recipes/new');
    expect(el.classList.contains('editing')).toBe(false);
  });
});
