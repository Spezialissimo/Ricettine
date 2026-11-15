import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CookbookApi } from '../cookbooks/cookbook.api';
import { CookbookSummary } from '../cookbooks/cookbook.model';
import { RecipeApi } from '../recipes/recipe.api';
import { RecipeSummary } from '../recipes/recipe.model';
import { clearOverlays, settle } from '../testing/spec-helpers';
import { en, provideTestTransloco } from '../testing/transloco';
import { KitchenOverviewPage, OVERVIEW_LIMIT } from './overview.page';

const recipe = (i: number): RecipeSummary => ({
  id: 'r' + i,
  title: 'Recipe ' + i,
  status: 'PUBLISHED',
  visibility: 'PRIVATE',
  coverThumbUrl: null,
  updatedAt: '2026-11-03T10:00:00Z',
});
const cookbook = (i: number): CookbookSummary => ({
  id: 'c' + i,
  name: 'Book ' + i,
  visibility: 'PRIVATE',
  role: i % 2 ? 'AUTHOR' : 'OWNER',
  recipeCount: 0,
  coverThumbUrl: null,
  updatedAt: '2026-11-04T10:00:00Z',
});

async function overview(recipes: Partial<RecipeApi>, cookbooks: Partial<CookbookApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: RecipeApi, useValue: recipes },
      { provide: CookbookApi, useValue: cookbooks },
    ],
  });
  const f = TestBed.createComponent(KitchenOverviewPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement };
}

const section = (el: HTMLElement, id: string) =>
  el.querySelector(`section[aria-labelledby="${id}"]`) as HTMLElement;

describe('KitchenOverviewPage', () => {
  afterEach(clearOverlays);

  it('shows the first recipes and cookbooks, each with Show more to its tab', async () => {
    const { el } = await overview(
      { mine: async () => Array.from({ length: 7 }, (_, i) => recipe(i)) },
      { mine: async () => Array.from({ length: 5 }, (_, i) => cookbook(i)) },
    );
    const r = section(el, 'ov-recipes');
    const c = section(el, 'ov-cookbooks');
    expect(r.querySelector('h2')?.textContent).toContain(en.kitchen.recipes);
    expect(c.querySelector('h2')?.textContent).toContain(en.kitchen.cookbooks);
    expect(r.querySelectorAll('a.recipe').length).toBe(OVERVIEW_LIMIT);
    expect(r.querySelector('a.recipe')?.getAttribute('href')).toBe('/recipes/r0/view'); // the recipe, not the editor
    expect(c.querySelectorAll('a.cookbook').length).toBe(OVERVIEW_LIMIT);
    expect(c.textContent).toContain(en.cookbooks.roleAuthor); // co-authored ones are included
    const more = (s: HTMLElement) => s.querySelector('a.more') as HTMLAnchorElement;
    expect(more(r).getAttribute('href')).toBe('/kitchen/recipes');
    expect(more(r).textContent?.trim()).toBe(en.kitchen.showMore);
    expect(more(r).getAttribute('aria-label')).toBe(en.kitchen.showMoreRecipes);
    expect(more(c).getAttribute('href')).toBe('/kitchen/cookbooks');
    expect(more(c).getAttribute('aria-label')).toBe(en.kitchen.showMoreCookbooks);
  });

  it('empty sections invite creating, without Show more', async () => {
    const { el } = await overview({ mine: async () => [] }, { mine: async () => [] });
    const r = section(el, 'ov-recipes');
    const c = section(el, 'ov-cookbooks');
    expect(r.textContent).toContain(en.recipes.empty);
    expect(r.querySelector('.empty-state a.btn-primary')?.getAttribute('href')).toBe(
      '/recipes/new',
    );
    expect(c.textContent).toContain(en.cookbooks.empty);
    expect(c.querySelector('.empty-state button.btn-primary')?.textContent).toContain(
      en.cookbooks.emptyAction,
    );
    expect(el.querySelector('a.more')).toBeNull();
  });

  it('a failing section shows its own error and retry; the other still loads', async () => {
    const mine = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce([recipe(1)]);
    const { f, el } = await overview({ mine }, { mine: async () => [cookbook(2)] });
    const r = section(el, 'ov-recipes');
    expect(r.querySelector('[role="alert"]')).toBeTruthy();
    expect(section(el, 'ov-cookbooks').querySelectorAll('a.cookbook').length).toBe(1);
    r.querySelector<HTMLButtonElement>('button.retry')!.click();
    await settle(f);
    expect(mine).toHaveBeenCalledTimes(2);
    expect(r.querySelectorAll('a.recipe').length).toBe(1);
  });
});
