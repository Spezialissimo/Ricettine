import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { CookbookApi } from './cookbook.api';
import { Cookbook, CookbookEntry } from './cookbook.model';
import { CookbookPage } from './cookbook.page';

const person = (n: string) => ({ username: n, displayName: n.toUpperCase(), avatarUrl: null });
const entry = (over: Partial<CookbookEntry>): CookbookEntry => ({
  recipeId: 'r1', title: 'Tiramisu', author: person('ann'), addedBy: person('ann'), addedAt: '2026-11-04T10:00:00Z',
  mine: true, coverThumbUrl: null, ...over,
});
const book = (over: Partial<Cookbook> = {}): Cookbook => ({
  id: 'c1', name: 'Desserts', description: 'Sweet', visibility: 'PRIVATE', role: 'OWNER', owner: person('ann'),
  authors: [], shareUrl: 'https://x.test/c/TOK', cover: null, recipes: [entry({}), entry({ recipeId: 'r2', title: 'Panna cotta', mine: false, author: person('bob'), addedBy: null })],
  updatedAt: '2026-11-04T10:00:00Z', ...over,
});

async function mount(api: Partial<CookbookApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), provideTestTransloco(), { provide: CookbookApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1' }) } } },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(CookbookPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}
const btn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text) as HTMLElement | undefined;
const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;

describe('CookbookPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('renders name, description, badges and entries; every title opens the recipe through the cookbook link, own recipes also have Edit', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book()) });
    expect(el.querySelector('h1')?.textContent).toContain('Desserts');
    expect(el.textContent).toContain('Sweet');
    expect(el.textContent).toContain(en.cookbooks.roleOwner);
    const items = Array.from(el.querySelectorAll('li.entry')) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r1');
    expect(items[0].querySelector('a[aria-label="Edit Tiramisu"]')?.getAttribute('href')).toBe('/recipes/r1/edit');
    expect(items[0].textContent).toContain('ANN');
    expect(items[1].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r2');
    expect(items[1].querySelector('a[aria-label^="Edit"]')).toBeNull();
    expect(items[1].textContent).toContain('Panna cotta');
    expect(items[1].textContent).toContain('BOB');
    expect(items[1].textContent).toContain(en.cookbooks.deletedUser);
  });

  it('shows the thumbnail when there is one and the share link to every member', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book({ role: 'AUTHOR', recipes: [entry({ coverThumbUrl: '/media/m/THUMB.jpg?c=TOK' })] })) });
    expect(el.querySelector('li.entry img')?.getAttribute('src')).toBe('/media/m/THUMB.jpg?c=TOK');
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/c/TOK');
    expect(btn(el, en.cookbooks.resetLink)).toBeUndefined();
  });

  it('hides Edit and Delete cookbook for an AUTHOR but keeps Remove', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book({ role: 'AUTHOR' })) });
    expect(btn(el, en.cookbooks.edit)).toBeUndefined();
    expect(btn(el, en.cookbooks.delete)).toBeUndefined();
    expect(el.textContent).toContain(en.cookbooks.roleAuthor);
    expect(btn(el, 'Remove Tiramisu')).toBeTruthy();
  });

  it('Remove drops the entry through the API', async () => {
    const removeRecipe = vi.fn().mockResolvedValue(undefined);
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(book()), removeRecipe });
    btn(el, 'Remove Panna cotta')!.click();
    await settle(f);
    expect(removeRecipe).toHaveBeenCalledWith('c1', 'r2');
    expect(el.querySelectorAll('li.entry')).toHaveLength(1);
  });

  it('Delete cookbook names the cookbook, deletes on confirm and goes to the list', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()), remove });
    btn(el, en.cookbooks.delete)!.click();
    await settle(f);
    expect(overlay().textContent).toContain('Desserts');
    expect(remove).not.toHaveBeenCalled();
    btn(overlay(), en.cookbooks.deleteConfirm.confirm)!.click();
    await settle(f);
    expect(remove).toHaveBeenCalledWith('c1');
    expect(nav).toHaveBeenCalledWith('/cookbooks');
  });

  it('Edit patches through the shared dialog and shows the new name', async () => {
    const patch = vi.fn().mockResolvedValue(book({ name: 'Sweets' }));
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(book()), patch });
    btn(el, en.cookbooks.edit)!.click();
    await settle(f);
    const name = overlay().querySelector('input[type="text"]') as HTMLInputElement;
    name.value = 'Sweets';
    name.dispatchEvent(new Event('input'));
    (overlay().querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(patch).toHaveBeenCalledWith('c1', { name: 'Sweets', description: 'Sweet', visibility: 'PRIVATE' });
    expect(el.querySelector('h1')?.textContent).toContain('Sweets');
  });

  it('says so when the cookbook is not found', async () => {
    const { el } = await mount({ get: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404, error: { code: 'cookbook_not_found' } })) });
    expect(el.textContent).toContain(en.errors.cookbook_not_found);
  });
});
