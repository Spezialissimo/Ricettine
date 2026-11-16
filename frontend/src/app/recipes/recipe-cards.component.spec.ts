import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { RecipeCardsComponent } from './recipe-cards.component';
import { RecipeSummary } from './recipe.model';

const sum = (over: Partial<RecipeSummary>): RecipeSummary => ({
  id: 'x',
  title: 'T',
  status: 'PUBLISHED',
  visibility: 'PRIVATE',
  coverThumbUrl: null,
  updatedAt: '2026-11-03T10:00:00Z',
  ...over,
});

@Component({
  imports: [RecipeCardsComponent],
  template: '<app-recipe-cards [recipes]="recipes()" />',
})
class Host {
  readonly recipes = signal<RecipeSummary[]>([]);
}

describe('RecipeCardsComponent', () => {
  it('each card opens the recipe page, never the editor, with a status badge and an alt-named thumb', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTransloco()] });
    const f = TestBed.createComponent(Host);
    f.componentInstance.recipes.set([
      sum({ id: 'd', title: 'Draft pie', status: 'DRAFT', coverThumbUrl: '/media/m/THUMB.jpg' }),
      sum({ id: 'p', title: 'Soup', visibility: 'PUBLIC' }),
      sum({ id: 'u', title: '' }),
    ]);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const cards = Array.from(el.querySelectorAll('a.recipe'));
    expect(cards.map((a) => a.getAttribute('href'))).toEqual([
      '/recipes/d/view',
      '/recipes/p/view',
      '/recipes/u/view',
    ]);
    expect(cards.every((a) => !a.getAttribute('href')!.endsWith('/edit'))).toBe(true);
    expect(cards.map((a) => a.querySelector('.badge')?.textContent?.trim())).toEqual([
      en.recipes.status.draft,
      en.recipes.status.public,
      en.recipes.status.private,
    ]);
    expect(cards[0].querySelector('img.thumb')?.getAttribute('alt')).toBe(
      en.recipes.coverAlt.replace('{{title}}', 'Draft pie'),
    );
    expect(cards[1].querySelector('.thumb.none')).not.toBeNull();
    expect(cards[2].textContent).toContain(en.recipes.untitled);
  });
});
