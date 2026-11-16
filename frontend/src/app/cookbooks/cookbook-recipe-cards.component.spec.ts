import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { CookbookCard, CookbookRecipeCardsComponent } from './cookbook-recipe-cards.component';

const card = (over: Partial<CookbookCard>): CookbookCard => ({
  recipeId: 'r1',
  title: 'Tiramisu',
  authorName: 'Ann',
  coverThumbUrl: '/media/m1/thumb.jpg',
  link: ['/c', 'TOK', 'r', 'r1'],
  ...over,
});

async function mount(cards: CookbookCard[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTransloco()] });
  const f = TestBed.createComponent(CookbookRecipeCardsComponent);
  f.componentRef.setInput('cards', cards);
  await settle(f);
  return f.nativeElement as HTMLElement;
}

describe('CookbookRecipeCardsComponent', () => {
  it('renders a card per recipe: a photo, the title and the author, linking where told', async () => {
    const el = await mount([
      card({}),
      card({ recipeId: 'r2', title: 'Soup', link: ['/recipes', 'r2', 'view'] }),
    ]);
    const links = Array.from(el.querySelectorAll('a.recipe-card'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/c/TOK/r/r1', '/recipes/r2/view']);
    expect(links[0].querySelector('img.card-photo')?.getAttribute('src')).toBe(
      '/media/m1/thumb.jpg',
    );
    expect(links[0].querySelector('.card-title')?.textContent).toContain('Tiramisu');
    expect(links[0].textContent).toContain('by Ann');
  });

  it('without a photo shows the striped placeholder; a deleted author is named as such', async () => {
    const el = await mount([card({ coverThumbUrl: null, authorName: null })]);
    expect(el.querySelector('img.card-photo')).toBeNull();
    expect(el.querySelector('.card-photo.none')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent).toContain(en.cookbooks.deletedUser);
  });

  it('a card with no link is not a link', async () => {
    const el = await mount([card({ link: null })]);
    expect(el.querySelector('a.recipe-card')).toBeNull();
    expect(el.querySelector('div.recipe-card .card-title')?.textContent).toContain('Tiramisu');
  });
});
