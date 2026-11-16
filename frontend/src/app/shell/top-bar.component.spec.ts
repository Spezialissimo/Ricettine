import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { pressEscape } from '../testing/spec-helpers';
import { en, provideTestTransloco } from '../testing/transloco';
import { TopBarComponent } from './top-bar.component';

@Component({ template: '' })
class Blank {}

async function bar(
  opts: { signedIn?: boolean; editing?: boolean; loginNext?: string | null } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTestTransloco(),
      provideRouter([
        { path: '', component: Blank },
        { path: 'kitchen', component: Blank, children: [{ path: 'recipes', component: Blank }] },
        { path: 'recipes/new', component: Blank },
      ]),
    ],
  });
  if (opts.signedIn ?? true) {
    TestBed.inject(AuthStore).setMe({
      id: '1',
      email: 'a@b.c',
      username: 'ann',
      displayName: 'Ann',
      avatarUrl: null,
      admin: false,
    });
  }
  const f = TestBed.createComponent(TopBarComponent);
  f.componentRef.setInput('editing', opts.editing ?? false);
  f.componentRef.setInput('loginNext', opts.loginNext ?? null);
  document.body.appendChild(f.nativeElement);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  return {
    f,
    el,
    burger: () => el.querySelector('button.burger') as HTMLButtonElement,
    drawer: () => el.querySelector('nav#app-drawer') as HTMLElement | null,
  };
}

const links = (root: ParentNode, sel: string) =>
  Array.from(root.querySelectorAll(sel), (a) => ({
    href: a.getAttribute('href'),
    text: a.textContent?.replace(/\s+/g, ' ').trim(),
  }));

describe('TopBarComponent', () => {
  afterEach(() => document.querySelectorAll('app-top-bar').forEach((e) => e.remove()));

  it('desktop: logo to Discover, Discover / My kitchen, the "+ New recipe" pill, then the account menu', async () => {
    const { el } = await bar();
    expect(el.querySelector('a.logo')?.getAttribute('href')).toBe('/');
    expect(links(el, `nav[aria-label="${en.nav.main}"] a`)).toEqual([
      { href: '/', text: en.nav.discover },
      { href: '/kitchen', text: en.nav.kitchen },
    ]);
    const kids = Array.from(el.querySelector('.bar')!.children, (c) => c.tagName.toLowerCase());
    expect(kids).toEqual(['button', 'a', 'nav', 'a', 'app-account-menu']);
    const pill = el.querySelector('.bar > a.new')!;
    expect(pill.getAttribute('href')).toBe('/recipes/new');
    expect(pill.textContent?.trim()).toBe(en.nav.newRecipe);
  });

  it('while editing there is no "+ New recipe"', async () => {
    const { el } = await bar({ editing: true });
    expect(el.querySelector('a.new')).toBeNull();
  });

  it('marks My kitchen as current on any kitchen tab', async () => {
    const { f, el } = await bar();
    await TestBed.inject(Router).navigateByUrl('/kitchen/recipes');
    await f.whenStable();
    const main = `nav[aria-label="${en.nav.main}"]`;
    expect(el.querySelector(`${main} a[href="/kitchen"]`)?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(el.querySelector(`${main} a[href="/"]`)?.hasAttribute('aria-current')).toBe(false);
  });

  it('phone: ☰ before the logo opens the menu panel (logo, Discover, My kitchen, New recipe)', async () => {
    const { f, el, burger, drawer } = await bar();
    expect(burger().getAttribute('aria-label')).toBe(en.nav.openMenu);
    expect(burger().getAttribute('aria-controls')).toBe('app-drawer');
    expect(burger().getAttribute('aria-expanded')).toBe('false');
    expect(drawer()).toBeNull();

    burger().click();
    await f.whenStable();
    expect(burger().getAttribute('aria-expanded')).toBe('true');
    const d = drawer()!;
    expect(d.getAttribute('aria-label')).toBe(en.nav.sections);
    expect(d.querySelector('.drawer-logo')?.textContent?.trim()).toBe(en.common.appName);
    expect(links(d, ':scope > a')).toEqual([
      { href: '/', text: en.nav.discover },
      { href: '/kitchen', text: en.nav.kitchen },
      { href: '/recipes/new', text: en.nav.newRecipeItem },
    ]);
    await new Promise((r) => setTimeout(r)); // afterNextRender moves focus into the panel
    expect(document.activeElement).toBe(d.querySelector(':scope > a'));
    expect(el.querySelector('.backdrop')).not.toBeNull();
  });

  it('the menu closes on Escape (focus back on ☰), the close button, the backdrop and navigation', async () => {
    const { f, el, burger, drawer } = await bar();
    const open = async () => {
      burger().click();
      await f.whenStable();
      expect(drawer()).not.toBeNull();
    };

    await open();
    pressEscape(document.body);
    await f.whenStable();
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(burger());

    await open();
    (el.querySelector('.drawer-close') as HTMLButtonElement).click();
    await f.whenStable();
    expect(drawer()).toBeNull();

    await open();
    (el.querySelector('.backdrop') as HTMLElement).click();
    await f.whenStable();
    expect(drawer()).toBeNull();

    await open();
    await TestBed.inject(Router).navigateByUrl('/kitchen');
    await f.whenStable();
    expect(drawer()).toBeNull();
  });

  it('signed out: logo and Log in (back to the page), no menu, no navigation, no account', async () => {
    const { el } = await bar({ signedIn: false, loginNext: '/c/TOK' });
    expect(el.querySelector('button.burger')).toBeNull();
    expect(el.querySelector(`nav[aria-label="${en.nav.main}"]`)).toBeNull();
    expect(el.querySelector('app-account-menu')).toBeNull();
    const login = el.querySelector('a.login')!;
    expect(login.textContent?.trim()).toBe(en.auth.login);
    expect(login.getAttribute('href')).toBe('/login?next=%2Fc%2FTOK');
  });
});
