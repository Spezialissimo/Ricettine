import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, person, settle } from '../../testing/spec-helpers';
import { CookbookApi } from '../cookbook.api';
import { PublicCookbook } from '../cookbook.model';
import { CookbookViewPage } from './cookbook-view.page';

const pub = (over: Partial<PublicCookbook> = {}): PublicCookbook => ({
  name: 'Desserts', description: 'Sweet', owner: person('ann'), authors: [person('bob')], cover: null,
  recipes: [
    { recipeId: 'r1', title: 'Tiramisu', author: person('ann'), coverThumbUrl: '/media/m1/THUMB.jpg?c=t' },
    { recipeId: 'r2', title: 'Panna cotta', author: person('bob'), coverThumbUrl: null },
  ],
  viewerRole: null, ...over,
});

async function mount(byToken: CookbookApi['byToken'], me: unknown = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), provideTestTransloco(), { provide: CookbookApi, useValue: { byToken } },
      { provide: AuthStore, useValue: { me: signal(me) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 't' }) } } },
    ],
  });
  const f = TestBed.createComponent(CookbookViewPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement };
}

describe('CookbookViewPage', () => {
  it('renders name, description, people and recipe cards linking through the cookbook token', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub()));
    expect(el.querySelector('h1')?.textContent).toContain('Desserts');
    expect(el.textContent).toContain('Sweet');
    expect(el.textContent).toContain('ANN');
    expect(el.textContent).toContain('BOB');
    const cards = Array.from(el.querySelectorAll('li.card a')) as HTMLAnchorElement[];
    expect(cards.map((a) => a.getAttribute('href'))).toEqual(['/c/t/r/r1', '/c/t/r/r2']);
    expect(cards[0].textContent).toContain('Tiramisu');
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe('/media/m1/THUMB.jpg?c=t');
    expect(cards[1].querySelector('img')).toBeNull();
    expect(el.textContent).not.toContain(en.cookbooks.openMine);
  });

  it('offers "Open in my cookbooks" to members', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue(pub({ viewerRole: 'AUTHOR', cookbookId: 'c9' })), { id: 'u' });
    const a = Array.from(el.querySelectorAll('a')).find((x) => x.textContent?.trim() === en.cookbooks.openMine);
    expect(a?.getAttribute('href')).toBe('/cookbooks/c9');
  });

  it('shows a generic load error with Retry, which loads the cookbook', async () => {
    const byToken = vi.fn().mockRejectedValueOnce(new HttpErrorResponse({ status: 500 })).mockResolvedValueOnce(pub());
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
    expect(el.querySelector('li.card')).toBeNull();
  });

  it('says so when the cookbook is not found', async () => {
    const { el } = await mount(vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404, error: { code: 'cookbook_not_found' } })));
    expect(el.textContent).toContain(en.cookbooks.notFound);
    expect(el.querySelector('li.card')).toBeNull();
  });
});
