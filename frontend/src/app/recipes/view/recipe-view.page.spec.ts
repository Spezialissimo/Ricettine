import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthStore } from '../../core/auth.store';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, clearOverlays, overlay, settle } from '../../testing/spec-helpers';
import { installWakeLock, removeWakeLock } from './screen-wake-lock.testing';
import { CookbookApi } from '../../cookbooks/cookbook.api';
import { RecipeApi } from '../recipe.api';
import { PublicRecipe } from '../recipe.model';
import { RecipeViewPage } from './recipe-view.page';
import { provideSite } from '../../testing/site';

const photo = (id: string) => ({
  mediaId: id,
  thumbUrl: `/media/${id}/THUMB.jpg?s=tok`,
  displayUrl: `/media/${id}/DISPLAY.jpg?s=tok`,
});

const pub = (over: Partial<PublicRecipe> = {}): PublicRecipe => ({
  title: 'Lasagne',
  author: { username: 'giulia', displayName: 'Giulia', avatarUrl: null },
  portions: 4,
  prepMinutes: 30,
  cookMinutes: 90,
  source: null,
  notes: 'Rest it',
  cover: photo('c1'),
  groups: [
    {
      name: 'Ragu',
      ingredients: [
        { amount: 0.5, unit: 'kg', name: 'beef', note: 'minced' },
        { amount: null, unit: null, name: 'salt', note: null },
      ],
    },
    { name: null, ingredients: [{ amount: 1.5, unit: 'l', name: 'milk', note: null }] },
  ],
  steps: [
    { text: 'Brown the beef', photo: photo('s1') },
    { text: 'Simmer', photo: null },
  ],
  publishedAt: '2026-11-03T10:00:00Z',
  viewerIsAuthor: false,
  ...over,
});

async function mount(
  byToken: RecipeApi['byToken'],
  me: unknown = null,
  api: Partial<Record<keyof RecipeApi, unknown>> = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: RecipeApi, useValue: { byToken, ...api } },
      { provide: AuthStore, useValue: { me: signal(me) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } },
      },
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
    expect(chips).not.toContain('Serves');
    expect(el.querySelector('.ingredients [role="status"]')?.textContent).toContain('4 servings');
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
    expect(TestBed.inject(Title).getTitle()).toBe('Lasagne · Ricettine');
  });

  it('is accessible: hidden chip emoji, explicit list roles, group headings, focusable ingredients box', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    for (const chip of Array.from(el.querySelectorAll('.chips .chip'))) {
      const emoji = chip.querySelector('[aria-hidden="true"]');
      expect(emoji?.textContent?.trim()).toMatch(/\p{Extended_Pictographic}/u);
      expect(chip.textContent!.replace(emoji!.textContent!, '')).not.toMatch(
        /\p{Extended_Pictographic}/u,
      );
    }
    expect(el.querySelector('ol.steps')?.getAttribute('role')).toBe('list');
    const lists = Array.from(el.querySelectorAll('.ingredients ul'));
    expect(lists.length).toBe(2);
    lists.forEach((l) => expect(l.getAttribute('role')).toBe('list'));
    expect(el.querySelector('.chips')?.getAttribute('role')).toBe('list');
    expect(
      Array.from(el.querySelectorAll('.ingredients h3')).map((h) => h.textContent?.trim()),
    ).toContain('Ragu');
    // the sticky ingredients box (desktop) is a scroll box: keyboard-scrollable, named by its title
    const box = el.querySelector('.ingredients')!;
    expect(box.getAttribute('tabindex')).toBe('0');
    expect(el.querySelector('#' + box.getAttribute('aria-labelledby'))?.textContent).toContain(
      en.editor.ingredients,
    );
  });

  it('lays out a header (title, details, author, photo, actions), then the ingredients and the steps', async () => {
    const { el } = await mount(
      vi.fn().mockResolvedValue(pub({ cover: photo('c1'), prepMinutes: 10, source: 'Nonna' })),
    );
    const head = el.querySelector('section.recipe-head')!;
    expect(head.querySelector('.hero .overlay h1')?.textContent).toContain('Lasagne');
    for (const sel of [
      '.meta .chips',
      '.meta p.source',
      '.meta .author',
      'img.cover',
      '.actions',
    ]) {
      expect(head.querySelector(sel), sel).not.toBeNull();
    }
    const layout = el.querySelector('.layout')!;
    expect(layout.previousElementSibling).toBe(head);
    expect(Array.from(layout.children).map((c) => c.className)).toEqual([
      'ingredients',
      'steps-section',
    ]);
    // ingredients: a section title like Steps, then the card headed by the servings pill
    const ing = layout.querySelector('.ingredients')!;
    expect(ing.querySelector('h2')?.textContent).toContain(en.editor.ingredients);
    expect(ing.querySelector('.ing-card .serves app-portions-stepper')).not.toBeNull();
  });

  it('leaves out empty steps and numbers the rest without gaps', async () => {
    const { el } = await mount(
      vi.fn().mockResolvedValue(
        pub({
          steps: [
            { text: 'Boil', photo: null },
            { text: '   ', photo: null },
            { text: '', photo: photo('s3') },
            { text: 'Serve', photo: null },
          ],
        }),
      ),
    );
    const items = Array.from(el.querySelectorAll('ol.steps li'));
    expect(items.length).toBe(3);
    expect(items.map((li) => li.querySelector('.num')?.textContent?.trim())).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(items[2].textContent).toContain('Serve');
  });

  it('puts the comma right after the ingredient name, with no space before it', async () => {
    const { el } = await mount(
      vi.fn().mockResolvedValue(
        pub({
          groups: [
            {
              name: null,
              ingredients: [{ amount: null, unit: null, name: 'Prezzemolo', note: 'tritato q.b.' }],
            },
          ],
        }),
      ),
    );
    const text = el.querySelector('.ingr-list li')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(text).toBe('Prezzemolo, tritato q.b.');
  });

  it('scales amounts with the servings pill and back', async () => {
    const r = pub({
      portions: 4,
      groups: [
        {
          name: null,
          ingredients: [
            { amount: 200, unit: 'g', name: 'flour', note: null },
            { amount: null, unit: null, name: 'salt', note: null },
          ],
        },
      ],
    });
    const { f, el } = await mount(vi.fn().mockResolvedValue(r));
    const ing = () => el.querySelector('.ingredients')!.textContent!.replace(/\s+/g, ' ');
    const click = async (label: string) => {
      (
        Array.from(el.querySelectorAll('.ingredients button')).find(
          (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
        ) as HTMLElement
      ).click();
      await settle(f);
    };
    expect(ing()).toContain('200 g flour');
    await click('More portions');
    await click('More portions');
    expect(ing()).toContain('300 g flour');
    expect(ing()).toContain('6 servings');
    expect(ing()).toMatch(/salt/);
    expect(ing()).not.toMatch(/\d salt/);
    await click('Fewer portions');
    await click('Fewer portions');
    expect(ing()).toContain('200 g flour');
    expect(ing()).toContain('4 servings');
  });

  it('offers Keep screen on as a checkbox in the header (desktop) when the Wake Lock API exists', async () => {
    installWakeLock();
    try {
      const { el } = await mount(vi.fn().mockResolvedValue(pub()));
      const keep = el.querySelector('section.recipe-head app-keep-screen-on')!;
      expect(keep.querySelector('input[type="checkbox"]')).not.toBeNull();
      expect(keep.textContent).toContain(en.recipes.keepScreenOn);
    } finally {
      removeWakeLock();
    }
  });

  it('the ⋯ menu (phone) holds Add to cookbook, Share and Keep screen on, sharing the lock with the checkbox', async () => {
    const wl = installWakeLock();
    try {
      const { f, el } = await mount(vi.fn().mockResolvedValue(pub()), { username: 'x' });
      const more = el.querySelector('button.more') as HTMLButtonElement;
      expect(more.getAttribute('aria-label')).toBe(en.recipes.more);
      more.click();
      await settle(f);
      const items = Array.from(overlay().querySelectorAll('.menu-item'));
      expect(items.map((i) => i.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        en.cookbooks.addToCookbook,
        en.recipes.share,
        en.recipes.keepScreenOn,
      ]);
      const keep = items[2] as HTMLElement;
      expect(keep.getAttribute('role')).toBe('menuitemcheckbox');
      keep.click();
      await settle(f);
      expect(wl.requests).toEqual(['screen']);
      const box = el.querySelector('app-keep-screen-on input') as HTMLInputElement;
      expect(box.checked).toBe(true);
    } finally {
      removeWakeLock();
      clearOverlays();
    }
  });

  it('the author also finds Edit in the ⋯ menu', async () => {
    const { f, el } = await mount(
      vi.fn().mockResolvedValue(pub({ viewerIsAuthor: true, recipeId: 'abc' })),
      { username: 'x' },
    );
    (el.querySelector('button.more') as HTMLButtonElement).click();
    await settle(f);
    const edit = Array.from(overlay().querySelectorAll('a.menu-item')).find(
      (a) => a.textContent?.trim() === en.recipes.edit,
    );
    expect(edit?.getAttribute('href')).toBe('/recipes/abc/edit');
    clearOverlays();
  });

  it('Share opens the share sheet with this recipe link; a reader gets no Reset link', async () => {
    const { f, el } = await mount(vi.fn().mockResolvedValue(pub()), { username: 'x' });
    const share = el.querySelector('.actions button.share') as HTMLButtonElement;
    expect(share.textContent).toContain(en.recipes.share);
    share.click();
    await settle(f);
    expect(overlay().querySelector('[data-url]')?.textContent?.trim()).toBe(
      `${location.origin}/r/tok`,
    );
    expect(btn(overlay(), en.editor.resetLink)).toBeUndefined();
    clearOverlays();
  });

  it('the author resets the link from the share sheet, and the page moves to the new link', async () => {
    const get = vi.fn().mockResolvedValue({ version: 7 });
    const resetLink = vi.fn().mockResolvedValue({ shareUrl: 'https://x.test/r/NEW' });
    const { f, el } = await mount(
      vi.fn().mockResolvedValue(pub({ viewerIsAuthor: true, recipeId: 'abc' })),
      { username: 'x' },
      { get, resetLink },
    );
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (el.querySelector('.actions button.share') as HTMLButtonElement).click();
    await settle(f);
    btn(overlay(), en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(resetLink).toHaveBeenCalledWith('abc', 7);
    expect(nav).toHaveBeenCalledWith('/r/NEW', { replaceUrl: true });
    expect(overlay().querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/NEW');
    clearOverlays();
  });

  it('shows the not-found state with a link home on 404', async () => {
    const { el } = await mount(vi.fn().mockRejectedValue(http(404, 'recipe_not_found')));
    expect(el.textContent).toContain(en.recipes.notFound);
    expect(el.querySelector('.chips')).toBeNull();
    const home = Array.from(el.querySelectorAll('main a')).find(
      (a) => a.getAttribute('href') === '/',
    );
    expect(home).toBeTruthy();
  });

  it('shows an error with Retry on a network failure, and Retry loads the recipe', async () => {
    const byToken = vi.fn().mockRejectedValueOnce(http(0)).mockResolvedValue(pub());
    const { f, el } = await mount(byToken);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.network_error);
    (
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === en.common.retry,
      ) as HTMLElement
    ).click();
    await settle(f);
    expect(el.querySelector('h1')?.textContent).toContain('Lasagne');
  });

  it('renders an http(s) source as a plain line with a safe external link naming the site', async () => {
    const { el } = await mount(
      vi
        .fn()
        .mockResolvedValue(
          pub({ source: 'https://www.ricette.example.it/Pasta-al-tonno-in-bianco.html' }),
        ),
    );
    expect(el.querySelector('.chips .chip a')).toBeNull(); // not a pill
    const a = el.querySelector('p.source a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe(
      'https://www.ricette.example.it/Pasta-al-tonno-in-bianco.html',
    );
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.textContent).toContain('ricette.example.it');
    expect(a.textContent).not.toContain('Pasta-al-tonno');
    expect(el.querySelector('p.source')?.textContent).toContain(en.recipes.source.trim());
  });

  it('renders any other source as plain text, never as a link', async () => {
    for (const source of ['javascript:alert(1)', 'Nonna', 'ftp://x/y', ' https://x']) {
      TestBed.resetTestingModule();
      const { el } = await mount(vi.fn().mockResolvedValue(pub({ source })));
      expect(el.querySelector('p.source a')).toBeNull();
      expect(el.querySelector('p.source')!.textContent).toContain(source.trim());
    }
  });

  it('has the app top bar: signed out, Log in back to this recipe; signed in, the app navigation; Edit only for the author', async () => {
    let r = await mount(vi.fn().mockResolvedValue(pub()));
    const login = r.el.querySelector('app-top-bar header a[href^="/login"]');
    expect(login?.getAttribute('href')).toBe('/login?next=%2Fr%2Ftok');
    expect(r.el.querySelector('a[href$="/edit"]')).toBeNull();

    TestBed.resetTestingModule();
    r = await mount(vi.fn().mockResolvedValue(pub()), { displayName: 'Me', username: 'me' });
    expect(r.el.querySelector('app-top-bar a[href="/kitchen"]')?.textContent).toContain(
      en.nav.kitchen,
    );
    expect(r.el.querySelector('app-top-bar app-account-menu')).not.toBeNull();
    expect(r.el.querySelector('header a[href^="/login"]')).toBeNull();
    expect(r.el.querySelector('a[href$="/edit"]')).toBeNull();

    TestBed.resetTestingModule();
    r = await mount(vi.fn().mockResolvedValue(pub({ viewerIsAuthor: true, recipeId: 'abc' })), {
      displayName: 'Me',
    });
    const edit = r.el.querySelector('.actions a[href="/recipes/abc/edit"]');
    expect(edit?.textContent?.trim()).toBe(en.recipes.edit);
  });

  it('links the author to their profile only when logged in', async () => {
    const anon = await mount(vi.fn().mockResolvedValue(pub()), null);
    expect(anon.el.querySelector('.author a[href="/u/giulia"]')).toBeNull();
    expect(anon.el.querySelector('.author')!.textContent).toContain('by Giulia');
    TestBed.resetTestingModule();
    const user = await mount(vi.fn().mockResolvedValue(pub()), { username: 'x' });
    expect(user.el.querySelector('.author a[href="/u/giulia"]')?.textContent).toContain(
      'by Giulia',
    );
  });

  it('offers Add to cookbook to a logged-in visitor only', async () => {
    const text = en.cookbooks.addToCookbook;
    const has = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.trim() === text);
    const anon = await mount(vi.fn().mockResolvedValue(pub()), null);
    expect(has(anon.el)).toBe(false);
    TestBed.resetTestingModule();
    const user = await mount(vi.fn().mockResolvedValue(pub()), { username: 'x' });
    expect(has(user.el)).toBe(true);
  });
});

describe('RecipeViewPage through a cookbook', () => {
  const cookbookByToken = vi.fn();
  async function mountVia(recipeByToken: unknown, me: unknown = { id: 'u' }) {
    cookbookByToken.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTransloco(),
        { provide: RecipeApi, useValue: { byToken: vi.fn() } },
        { provide: CookbookApi, useValue: { recipeByToken, byToken: cookbookByToken } },
        { provide: AuthStore, useValue: { me: signal(me) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ token: 't', recipeId: 'r1' }),
              data: { via: 'cookbook' },
            },
          },
        },
      ],
    });
    const f = TestBed.createComponent(RecipeViewPage);
    await settle(f);
    return { el: f.nativeElement as HTMLElement };
  }

  it('loads by cookbook token and recipe id, has no Back to the cookbook, and hides Add to cookbook', async () => {
    const recipeByToken = vi.fn().mockResolvedValue(pub({ cookbookName: 'Desserts' }));
    const { el } = await mountVia(recipeByToken);
    expect(recipeByToken).toHaveBeenCalledTimes(1);
    expect(recipeByToken).toHaveBeenCalledWith('t', 'r1');
    expect(cookbookByToken).not.toHaveBeenCalled();
    expect(el.querySelector('h1')?.textContent).toContain('Lasagne');
    expect(
      Array.from(el.querySelectorAll('a')).some((a) => a.textContent?.includes('Back to')),
    ).toBe(false);
    expect(
      Array.from(el.querySelectorAll('button')).some(
        (b) => b.textContent?.trim() === en.cookbooks.addToCookbook,
      ),
    ).toBe(false);
  });

  it('on 404 shows not found with a generic Back link', async () => {
    const { el } = await mountVia(vi.fn().mockRejectedValue(http(404, 'recipe_not_found')));
    expect(el.textContent).toContain(en.recipes.notFound);
    const back = Array.from(el.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/c/t',
    );
    expect(back?.textContent?.trim()).toBe(en.cookbooks.back);
  });
});

describe('RecipeViewPage: the author preview', () => {
  async function preview(over: Record<string, unknown> = {}, api: Record<string, unknown> = {}) {
    const get = vi.fn().mockResolvedValue({
      ...pub({ title: 'Draft pie' }),
      id: 'r9',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      version: 3,
      shareUrl: null,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
      publishedAt: null,
      ...over,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTransloco(),
        { provide: RecipeApi, useValue: { get, ...api } },
        { provide: CookbookApi, useValue: {} },
        {
          provide: AuthStore,
          useValue: {
            me: signal({ username: 'ann', displayName: 'Ann', avatarUrl: null, admin: false }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'r9' }), data: { via: 'preview' } },
          },
        },
      ],
    });
    const f = TestBed.createComponent(RecipeViewPage);
    await settle(f);
    return { f, el: f.nativeElement as HTMLElement, get };
  }

  it('Reset link writes at the version shown, without fetching it again', async () => {
    const resetLink = vi.fn().mockResolvedValue({ version: 4, shareUrl: 'https://x.test/r/NEW' });
    const { f, el, get } = await preview(
      { status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' },
      { resetLink },
    );
    (el.querySelector('.actions button.share') as HTMLButtonElement).click();
    await settle(f);
    btn(overlay(), en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(resetLink).toHaveBeenCalledWith('r9', 3);
    expect(get).toHaveBeenCalledTimes(1);
    expect(overlay().querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/NEW');
    clearOverlays();
  });

  it('shows the saved draft as readers will, says it is a preview, and leads back to the editor', async () => {
    const { el, get } = await preview();
    expect(get).toHaveBeenCalledWith('r9');
    expect(el.querySelector('h1')?.textContent).toContain('Draft pie');
    expect(el.querySelector('.preview-banner')?.textContent).toContain(en.editor.previewBanner);
    // Back to editor is in the (sticky) preview banner, not the top bar
    expect(el.querySelector('header')?.textContent).not.toContain(en.editor.backToEditor);
    const back = Array.from(el.querySelectorAll('.preview-banner a')).find(
      (a) => a.textContent?.trim() === en.editor.backToEditor,
    );
    expect(back?.getAttribute('href')).toBe('/recipes/r9/edit');
    expect(el.textContent).toContain('Ann');
    expect(el.textContent).not.toContain(en.cookbooks.addToCookbook);
    expect(el.textContent).not.toContain(en.recipes.edit);
  });
});

describe('RecipeViewPage: your own recipe (/recipes/:id/view)', () => {
  const own = (over: Record<string, unknown> = {}) => ({
    ...pub({ title: 'Draft pie' }),
    id: 'r9',
    status: 'DRAFT',
    visibility: 'PRIVATE',
    version: 3,
    shareUrl: null,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
    publishedAt: null,
    ...over,
  });

  async function mountOwn(api: Partial<Record<keyof RecipeApi, unknown>>) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTransloco(),
        { provide: RecipeApi, useValue: api },
        { provide: CookbookApi, useValue: {} },
        {
          provide: AuthStore,
          useValue: {
            me: signal({ username: 'ann', displayName: 'Ann', avatarUrl: null, admin: false }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'r9' }), data: { via: 'own' } },
          },
        },
      ],
    });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(RecipeViewPage);
    await settle(f);
    return { f, el: f.nativeElement as HTMLElement, nav };
  }
  const banner = (el: HTMLElement) => el.querySelector('.preview-banner.draft');

  it('a draft says so, with Publish; Edit is on the page; no Share yet', async () => {
    const { el } = await mountOwn({ get: vi.fn().mockResolvedValue(own()) });
    expect(banner(el)?.textContent).toContain(en.recipes.draftBanner);
    expect(btn(banner(el)!, en.recipes.publish)).toBeTruthy();
    expect(el.querySelector('.actions a[href="/recipes/r9/edit"]')).not.toBeNull();
    expect(el.querySelector('.actions button.share')).toBeNull();
    expect(el.classList.contains('previewing')).toBe(true); // the sticky column clears the banner
  });

  it('Publish publishes the version shown and moves to the share link', async () => {
    const get = vi.fn().mockResolvedValue(own());
    const publish = vi
      .fn()
      .mockResolvedValue(own({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/PUB' }));
    const { f, el, nav } = await mountOwn({ get, publish });
    btn(banner(el)!, en.recipes.publish)!.click();
    await settle(f);
    expect(get).toHaveBeenCalledTimes(1); // no second fetch: the page writes at what it shows
    expect(publish).toHaveBeenCalledWith('r9', 3);
    expect(nav).toHaveBeenCalledWith('/r/PUB', { replaceUrl: true });
  });

  it('a draft changed elsewhere meanwhile is not published unseen: it says so and shows the latest', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(own())
      .mockResolvedValue(own({ title: 'Changed pie', version: 4 }));
    const publish = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }),
      )
      .mockResolvedValue(
        own({ status: 'PUBLISHED', version: 5, shareUrl: 'https://x.test/r/PUB' }),
      );
    const { f, el, nav } = await mountOwn({ get, publish });
    btn(banner(el)!, en.recipes.publish)!.click();
    await settle(f);
    expect(banner(el)?.querySelector('[role="alert"]')?.textContent).toContain(
      en.errors.recipe_conflict,
    );
    expect(el.querySelector('h1')?.textContent).toContain('Changed pie');
    expect(nav).not.toHaveBeenCalled();

    btn(banner(el)!, en.recipes.publish)!.click();
    await settle(f);
    expect(publish).toHaveBeenLastCalledWith('r9', 4);
    expect(nav).toHaveBeenCalledWith('/r/PUB', { replaceUrl: true });
  });

  it('an incomplete draft cannot be published: the banner points to Edit', async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(
        new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete' } }),
      );
    const { f, el, nav } = await mountOwn({ get: vi.fn().mockResolvedValue(own()), publish });
    btn(banner(el)!, en.recipes.publish)!.click();
    await settle(f);
    expect(banner(el)?.querySelector('[role="alert"]')?.textContent).toContain(
      en.recipes.publishIncomplete,
    );
    expect(nav).not.toHaveBeenCalled();
  });

  it('a published recipe has one address: its share link', async () => {
    const { el, nav } = await mountOwn({
      get: vi
        .fn()
        .mockResolvedValue(own({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/PUB' })),
    });
    expect(nav).toHaveBeenCalledWith('/r/PUB', { replaceUrl: true });
    expect(banner(el)).toBeNull();
  });
});

describe('RecipeViewPage in the demo', () => {
  it('has no Add to cookbook for the signed-in guest, but keeps Share', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTransloco(),
        provideSite({ demo: true }),
        { provide: RecipeApi, useValue: { byToken: vi.fn().mockResolvedValue(pub()) } },
        { provide: AuthStore, useValue: { me: signal({ username: 'ospite' }) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } },
        },
      ],
    });
    const f = TestBed.createComponent(RecipeViewPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(btn(el, en.cookbooks.addToCookbook)).toBeUndefined();
    expect(btn(el, en.recipes.share)).toBeDefined();
  });
});
