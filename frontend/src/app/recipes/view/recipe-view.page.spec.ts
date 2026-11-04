import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthStore } from '../../core/auth.store';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { RecipeApi } from '../recipe.api';
import { PublicRecipe } from '../recipe.model';
import { RecipeViewPage } from './recipe-view.page';

const photo = (id: string) => ({ mediaId: id, thumbUrl: `/media/${id}/THUMB.jpg?s=tok`, displayUrl: `/media/${id}/DISPLAY.jpg?s=tok` });

const pub = (over: Partial<PublicRecipe> = {}): PublicRecipe => ({
  title: 'Lasagne', author: { username: 'giulia', displayName: 'Giulia', avatarUrl: null },
  portions: 4, prepMinutes: 30, cookMinutes: 90, source: null, notes: 'Rest it',
  cover: photo('c1'),
  groups: [
    { name: 'Ragu', ingredients: [{ amount: 0.5, unit: 'kg', name: 'beef', note: 'minced' }, { amount: null, unit: null, name: 'salt', note: null }] },
    { name: null, ingredients: [{ amount: 1.5, unit: 'l', name: 'milk', note: null }] },
  ],
  steps: [{ text: 'Brown the beef', photo: photo('s1') }, { text: 'Simmer', photo: null }],
  publishedAt: '2026-11-03T10:00:00Z', viewerIsAuthor: false, ...over,
});

async function mount(byToken: RecipeApi['byToken'], me: unknown = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: RecipeApi, useValue: { byToken } },
      { provide: AuthStore, useValue: { me: signal(me) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } } },
    ],
  });
  const f = TestBed.createComponent(RecipeViewPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement };
}
const http = (status: number, code?: string) =>
  new HttpErrorResponse({ status, error: code ? { code } : null });

describe('RecipeViewPage', () => {
  it('renders title, author, chips, ingredient groups with i18n units, numbered steps and lazy photos', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    expect(el.querySelector('h1')?.textContent).toContain('Lasagne');
    expect(el.textContent).toContain('Giulia');
    const chips = el.querySelector('.chips')!.textContent!;
    expect(chips).toContain('Serves 4');
    expect(chips).toContain('Prep 30m');
    expect(chips).toContain('Cook 1h 30');
    const ing = el.querySelector('.ingredients')!;
    expect(ing.textContent).toContain('Ragu');
    expect(ing.textContent).toMatch(/0\.5\s*kg\s*beef/);
    expect(ing.textContent).toContain('minced');
    expect(ing.textContent).toMatch(/1\.5\s*l\s*milk/);
    expect(ing.textContent).toContain('salt');
    const steps = Array.from(el.querySelectorAll('ol.steps > li'));
    expect(steps.length).toBe(2);
    expect(steps[0].textContent).toContain('Brown the beef');
    const img = steps[0].querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/media/s1/DISPLAY.jpg?s=tok');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('Step 1');
    expect(steps[1].querySelector('img')).toBeNull();
    const cover = el.querySelector('img.cover')!;
    expect(cover.getAttribute('src')).toBe('/media/c1/DISPLAY.jpg?s=tok');
    expect(cover.getAttribute('alt')).toBe(''); // the title is already the h1
    expect(cover.getAttribute('loading')).toBe('eager');
    expect(cover.getAttribute('fetchpriority')).toBe('high');
    expect(el.textContent).toContain('Rest it');
    expect(TestBed.inject(Title).getTitle()).toBe('Lasagne');
  });

  it('is accessible: hidden chip emoji, explicit list roles, group headings, focusable ingredients box', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    for (const chip of Array.from(el.querySelectorAll('.chips .chip'))) {
      const emoji = chip.querySelector('[aria-hidden="true"]');
      expect(emoji?.textContent?.trim()).toMatch(/\p{Extended_Pictographic}/u);
      expect(chip.textContent!.replace(emoji!.textContent!, '')).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(el.querySelector('ol.steps')?.getAttribute('role')).toBe('list');
    const lists = Array.from(el.querySelectorAll('.ingredients ul'));
    expect(lists.length).toBe(2);
    lists.forEach((l) => expect(l.getAttribute('role')).toBe('list'));
    expect(el.querySelector('.chips')?.getAttribute('role')).toBe('list');
    expect(Array.from(el.querySelectorAll('.ingredients h3')).map((h) => h.textContent?.trim())).toContain('Ragu');
    const box = el.querySelector('.ingredients')!;
    expect(box.getAttribute('tabindex')).toBe('0');
    expect(el.querySelector('#' + box.getAttribute('aria-labelledby'))?.textContent).toContain(en.editor.ingredients);
  });

  it('shows the not-found state with a link home on 404', async () => {
    const { el } = await mount(vi.fn().mockRejectedValue(http(404, 'recipe_not_found')));
    expect(el.textContent).toContain(en.recipes.notFound);
    expect(el.querySelector('.chips')).toBeNull();
    const home = Array.from(el.querySelectorAll('main a')).find((a) => a.getAttribute('href') === '/');
    expect(home).toBeTruthy();
  });

  it('shows an error with Retry on a network failure, and Retry loads the recipe', async () => {
    const byToken = vi.fn().mockRejectedValueOnce(http(0)).mockResolvedValue(pub());
    const { f, el } = await mount(byToken);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.network_error);
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === en.common.retry) as HTMLElement).click();
    await settle(f);
    expect(el.querySelector('h1')?.textContent).toContain('Lasagne');
  });

  it('renders an http(s) source as a safe external link', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub({ source: 'https://example.com/r' })));
    const a = el.querySelector('.chips a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.com/r');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('renders any other source as plain text, never as a link', async () => {
    for (const source of ['javascript:alert(1)', 'Nonna', 'ftp://x/y', ' https://x']) {
      TestBed.resetTestingModule();
      const { el } = await mount(vi.fn().mockResolvedValue(pub({ source })));
      expect(el.querySelector('.chips a')).toBeNull();
      expect(el.querySelector('.chips')!.textContent).toContain(source.trim());
    }
  });

  it('logged out: Log in link carries next; logged in: link to My recipes; Edit only for the author', async () => {
    let r = await mount(vi.fn().mockResolvedValue(pub()));
    const login = r.el.querySelector('header a[href^="/login"]');
    expect(login?.getAttribute('href')).toBe('/login?next=%2Fr%2Ftok');
    expect(r.el.querySelector('a[href$="/edit"]')).toBeNull();

    TestBed.resetTestingModule();
    r = await mount(vi.fn().mockResolvedValue(pub()), { displayName: 'Me' });
    expect(r.el.querySelector('header a[href="/recipes"]')?.textContent).toContain(en.nav.recipes);
    expect(r.el.querySelector('header a[href^="/login"]')).toBeNull();
    expect(r.el.querySelector('a[href$="/edit"]')).toBeNull();

    TestBed.resetTestingModule();
    r = await mount(vi.fn().mockResolvedValue(pub({ viewerIsAuthor: true, recipeId: 'abc' })), { displayName: 'Me' });
    const edit = r.el.querySelector('a[href="/recipes/abc/edit"]');
    expect(edit?.textContent?.trim()).toBe(en.recipes.edit);
  });

  it('offers Add to cookbook to a logged-in visitor only', async () => {
    const text = en.cookbooks.addToCookbook;
    const has = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.trim() === text);
    const anon = await mount(vi.fn().mockResolvedValue(pub()), null);
    expect(has(anon.el)).toBe(false);
    TestBed.resetTestingModule();
    const user = await mount(vi.fn().mockResolvedValue(pub()), { username: 'x' });
    expect(has(user.el)).toBe(true);
  });
});
