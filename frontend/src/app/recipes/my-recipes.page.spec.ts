import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { MyRecipesPage } from './my-recipes.page';
import { NewRecipePage } from './new-recipe.page';
import { RecipeApi } from './recipe.api';
import { RecipeSummary } from './recipe.model';

const sum = (over: Partial<RecipeSummary>): RecipeSummary => ({
  id: 'x', title: 'T', status: 'DRAFT', visibility: 'PRIVATE', coverThumbUrl: null,
  updatedAt: '2026-11-03T10:00:00Z', ...over,
});

function setup(api: Partial<RecipeApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco(),
      { provide: RecipeApi, useValue: api },
    ],
  });
}

describe('MyRecipesPage', () => {
  it('renders titles, badges, thumbs and editor links', async () => {
    setup({
      mine: async () => [
        sum({ id: 'a', title: 'Lasagne', status: 'DRAFT' }),
        sum({ id: 'b', title: '', status: 'PUBLISHED', visibility: 'PRIVATE', coverThumbUrl: '/media/m/THUMB.jpg' }),
        sum({ id: 'c', title: 'Tiramisu', status: 'PUBLISHED', visibility: 'PUBLIC' }),
      ],
    });
    const f = TestBed.createComponent(MyRecipesPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('My recipes');
    const links = Array.from(el.querySelectorAll('a.recipe')) as HTMLAnchorElement[];
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/recipes/a/edit', '/recipes/b/edit', '/recipes/c/edit']);
    expect(links[0].textContent).toContain('Lasagne');
    expect(links[0].textContent).toContain('Draft');
    expect(links[1].textContent).toContain('Untitled recipe');
    expect(links[1].textContent).toContain('Private');
    expect(links[2].textContent).toContain('Public');
    expect(links[1].querySelector('img')?.getAttribute('src')).toBe('/media/m/THUMB.jpg');
    expect(links[0].querySelector('img')).toBeNull();
  });

  it('shows an empty state linking to a new recipe', async () => {
    setup({ mine: async () => [] });
    const f = TestBed.createComponent(MyRecipesPage);
    await settle(f);
    const a = (f.nativeElement as HTMLElement).querySelector('a[href="/recipes/new"]');
    expect(a?.textContent).toContain(en.recipes.emptyAction);
  });

  it('shows an error with retry when loading fails', async () => {
    const mine = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    setup({ mine });
    const f = TestBed.createComponent(MyRecipesPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    (el.querySelector('button.retry') as HTMLButtonElement).click();
    await settle(f);
    expect(mine).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('NewRecipePage', () => {
  it('creates a recipe and redirects to its editor with replaceUrl', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new-id' });
    setup({ create });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(NewRecipePage);
    await settle(f);
    expect(create).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('/recipes/new-id/edit', { replaceUrl: true });
  });

  it('shows a spinner while pending, then an error with retry on failure', async () => {
    let reject!: (e: unknown) => void;
    const create = vi.fn()
      .mockReturnValueOnce(new Promise((_, r) => (reject = r)))
      .mockResolvedValueOnce({ id: 'n2' });
    setup({ create });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(NewRecipePage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')).toBeTruthy();
    reject(new Error('boom'));
    await settle(f);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    (el.querySelector('button.retry') as HTMLButtonElement).click();
    await settle(f);
    expect(nav).toHaveBeenCalledWith('/recipes/n2/edit', { replaceUrl: true });
  });
});
