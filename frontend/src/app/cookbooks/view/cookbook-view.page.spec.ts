import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, clearOverlays, overlay, person, settle } from '../../testing/spec-helpers';
import { CookbookApi } from '../cookbook.api';
import { PublicCookbook } from '../cookbook.model';
import { CookbookViewPage } from './cookbook-view.page';
import { provideSite } from '../../testing/site';

const pub = (over: Partial<PublicCookbook> = {}): PublicCookbook => ({
  name: 'Desserts',
  description: 'Sweet',
  owner: person('ann'),
  authors: [person('bob')],
  cover: null,
  recipes: [
    {
      recipeId: 'r1',
      title: 'Tiramisu',
      author: person('ann'),
      coverThumbUrl: '/media/m1/THUMB.jpg?c=t',
    },
    { recipeId: 'r2', title: 'Panna cotta', author: person('bob'), coverThumbUrl: null },
  ],
  viewerRole: null,
  ...over,
});

async function mount(
  byToken: CookbookApi['byToken'],
  me: unknown = null,
  api: Partial<CookbookApi> = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: CookbookApi, useValue: { byToken, ...api } },
      { provide: AuthStore, useValue: { me: signal(me) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ token: 't' }) } },
      },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(CookbookViewPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}
const editLink = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('a')).find((x) => x.textContent?.trim() === en.cookbooks.edit);

describe('CookbookViewPage', () => {
  afterEach(clearOverlays);

  it('is the one view: banner with name and facts, description, and recipe cards through the cookbook token', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    const hero = el.querySelector('app-cookbook-hero')!;
    expect(hero.querySelector('h1')?.textContent).toContain('Desserts');
    const facts = hero.querySelector('.facts')!.textContent!.replace(/\s+/g, ' ');
    expect(facts).toContain('2 recipes');
    expect(facts).toContain('by ANN and BOB');
    expect(el.querySelector('.book-desc')?.textContent).toContain('Sweet');
    const cards = Array.from(el.querySelectorAll('a.recipe-card')) as HTMLAnchorElement[];
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['/c/t/r/r1', '/c/t/r/r2']);
    expect(cards[0].textContent).toContain('Tiramisu');
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe('/media/m1/THUMB.jpg?c=t');
    expect(cards[1].querySelector('img')).toBeNull();
  });

  it('a reader gets Share but no Edit', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    expect(btn(el, en.cookbooks.share)).toBeTruthy();
    expect(editLink(el)).toBeUndefined();
  });

  it('a member gets Edit, to the cookbook edit page', async () => {
    const { el } = await mount(
      vi.fn().mockResolvedValue(pub({ viewerRole: 'AUTHOR', cookbookId: 'c9' })),
      { id: 'u' },
    );
    expect(editLink(el)?.getAttribute('href')).toBe('/cookbooks/c9/edit');
  });

  it('Share opens the sheet with this cookbook link; only the owner may reset it', async () => {
    const { f, el } = await mount(
      vi.fn().mockResolvedValue(pub({ viewerRole: 'AUTHOR', cookbookId: 'c9' })),
      { id: 'u' },
    );
    btn(el, en.cookbooks.share)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.cookbooks.shareSheetTitle);
    expect(overlay().querySelector('[data-url]')?.textContent?.trim()).toBe(
      `${location.origin}/c/t`,
    );
    expect(btn(overlay(), en.cookbooks.resetLink)).toBeUndefined();
  });

  it('the owner resets the link from the sheet and the page moves to the new link', async () => {
    const resetLink = vi.fn().mockResolvedValue({ shareUrl: 'https://x.test/c/NEW' });
    const { f, el, nav } = await mount(
      vi.fn().mockResolvedValue(pub({ viewerRole: 'OWNER', cookbookId: 'c9' })),
      { id: 'u' },
      { resetLink },
    );
    btn(el, en.cookbooks.share)!.click();
    await settle(f);
    btn(overlay(), en.cookbooks.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.cookbooks.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(resetLink).toHaveBeenCalledWith('c9');
    expect(nav).toHaveBeenCalledWith('/c/NEW', { replaceUrl: true });
    expect(overlay().textContent).toContain('https://x.test/c/NEW');
  });

  it('shows a generic load error with Retry, which loads the cookbook', async () => {
    const byToken = vi
      .fn()
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }))
      .mockResolvedValueOnce(pub());
    const { f, el } = await mount(byToken);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    expect(el.textContent).not.toContain(en.cookbooks.notFound);
    btn(el, en.common.retry)!.click();
    await settle(f);
    expect(byToken).toHaveBeenCalledTimes(2);
    expect(el.querySelector('h1')?.textContent).toContain('Desserts');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the empty state for a cookbook without recipes', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub({ recipes: [] })));
    expect(el.querySelector('p.empty')?.textContent).toContain(en.cookbooks.noRecipes);
    expect(el.querySelector('app-cookbook-recipe-cards')).toBeNull();
  });

  it('says so when the cookbook is not found', async () => {
    const { el } = await mount(
      vi
        .fn()
        .mockRejectedValue(
          new HttpErrorResponse({ status: 404, error: { code: 'cookbook_not_found' } }),
        ),
    );
    expect(el.textContent).toContain(en.cookbooks.notFound);
    expect(el.querySelector('app-cookbook-hero')).toBeNull();
  });
});

describe('CookbookViewPage in the demo', () => {
  it('has no Edit link for a member', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTransloco(),
        provideSite({ demo: true }),
        {
          provide: CookbookApi,
          useValue: {
            byToken: vi.fn().mockResolvedValue(pub({ viewerRole: 'OWNER', cookbookId: 'c1' })),
          },
        },
        { provide: AuthStore, useValue: { me: signal({ username: 'ospite' }) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 't' }) } },
        },
      ],
    });
    const f = TestBed.createComponent(CookbookViewPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')).not.toBeNull();
    expect(el.querySelector('a[href="/cookbooks/c1/edit"]')).toBeNull();
  });
});
