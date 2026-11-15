import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTestTransloco } from '../testing/transloco';
import { provideSite } from '../testing/site';
import { settle } from '../testing/spec-helpers';
import { RecipeApi } from './recipe.api';
import { NewRecipePage } from './new-recipe.page';

async function mount(demo: boolean, api: Partial<RecipeApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      provideSite({ demo }),
      { provide: RecipeApi, useValue: api },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(NewRecipePage);
  await settle(f);
  return nav;
}

describe('NewRecipePage', () => {
  it('newRecipeInDemoNavigatesToLocal', async () => {
    const create = vi.fn();
    const nav = await mount(true, { create });
    expect(create).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/recipes/local/edit', { replaceUrl: true });
  });

  it('creates a draft on the server outside the demo', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'r7' });
    const nav = await mount(false, { create });
    expect(nav).toHaveBeenCalledWith('/recipes/r7/edit', { replaceUrl: true });
  });
});
