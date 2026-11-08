import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { btn, clearOverlays, overlay, person, settle } from '../testing/spec-helpers';
import { CookbookApi } from './cookbook.api';
import { Cookbook, CookbookEntry } from './cookbook.model';
import { CookbookPage } from './cookbook.page';

const entry = (over: Partial<CookbookEntry>): CookbookEntry => ({
  recipeId: 'r1',
  title: 'Tiramisu',
  author: person('ann'),
  addedBy: person('ann'),
  addedAt: '2026-11-04T10:00:00Z',
  mine: true,
  coverThumbUrl: null,
  ...over,
});
const book = (over: Partial<Cookbook> = {}): Cookbook => ({
  id: 'c1',
  name: 'Desserts',
  description: 'Sweet',
  visibility: 'PRIVATE',
  role: 'OWNER',
  owner: person('ann'),
  authors: [],
  shareUrl: 'https://x.test/c/TOK',
  cover: null,
  recipes: [
    entry({}),
    entry({
      recipeId: 'r2',
      title: 'Panna cotta',
      mine: false,
      author: person('bob'),
      addedBy: null,
    }),
  ],
  updatedAt: '2026-11-04T10:00:00Z',
  ...over,
});

async function mount(api: Partial<CookbookApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: CookbookApi, useValue: { invites: vi.fn().mockResolvedValue([]), ...api } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c1' }) } },
      },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(CookbookPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}

describe('CookbookPage', () => {
  afterEach(clearOverlays);

  it('renders name, description, badges and entries; every title opens the recipe through the cookbook link, own recipes also have Edit', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book()) });
    expect(el.querySelector('h1')?.textContent).toContain('Desserts');
    expect(el.textContent).toContain('Sweet');
    expect(el.textContent).toContain(en.cookbooks.roleOwner);
    const items = Array.from(el.querySelectorAll('li.entry')) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r1');
    expect(items[0].querySelector('a[aria-label="Edit Tiramisu"]')?.getAttribute('href')).toBe(
      '/recipes/r1/edit',
    );
    expect(items[0].textContent).toContain('ANN');
    expect(items[1].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r2');
    expect(items[1].querySelector('a[aria-label^="Edit"]')).toBeNull();
    expect(items[1].textContent).toContain('Panna cotta');
    expect(items[1].textContent).toContain('BOB');
    expect(items[1].textContent).toContain(en.cookbooks.deletedUser);
  });

  it('shows the thumbnail when there is one and the share link to every member', async () => {
    const { el } = await mount({
      get: vi
        .fn()
        .mockResolvedValue(
          book({ role: 'AUTHOR', recipes: [entry({ coverThumbUrl: '/media/m/THUMB.jpg?c=TOK' })] }),
        ),
    });
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
    expect(patch).toHaveBeenCalledWith('c1', {
      name: 'Sweets',
      description: 'Sweet',
      visibility: 'PRIVATE',
    });
    expect(el.querySelector('h1')?.textContent).toContain('Sweets');
  });

  const cover = {
    mediaId: 'm1',
    thumbUrl: '/media/m1/thumb.jpg',
    displayUrl: '/media/m1/display.jpg',
  };
  const choose = (el: HTMLElement, file: File) => {
    const input = el.querySelector('app-photo-picker input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('the owner sets the cover from a picked file and sees it', async () => {
    const setCover = vi.fn().mockResolvedValue(book({ cover }));
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(book()), setCover });
    expect(el.querySelector('img.cover')).toBeNull();
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    choose(el, file);
    await settle(f);
    expect(setCover).toHaveBeenCalledWith('c1', file);
    expect(el.querySelector('img.cover')?.getAttribute('src')).toBe('/media/m1/display.jpg');
  });

  it('an oversize file is rejected on the client without a request', async () => {
    const setCover = vi.fn();
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(book()), setCover });
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 });
    choose(el, big);
    await settle(f);
    expect(setCover).not.toHaveBeenCalled();
    expect(el.textContent).toContain(en.errors.file_too_large);
  });

  it('Remove cover clears it', async () => {
    const removeCover = vi.fn().mockResolvedValue(book());
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(book({ cover })), removeCover });
    expect(el.querySelector('img.cover')).not.toBeNull();
    btn(el, en.cookbooks.cover.remove)!.click();
    await settle(f);
    expect(removeCover).toHaveBeenCalledWith('c1');
    expect(el.querySelector('img.cover')).toBeNull();
  });

  it('an author sees the cover but cannot change it', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book({ role: 'AUTHOR', cover })) });
    expect(el.querySelector('img.cover')).not.toBeNull();
    expect(el.querySelector('app-photo-picker')).toBeNull();
    expect(btn(el, en.cookbooks.cover.remove)).toBeUndefined();
  });

  it('says so when the cookbook is not found', async () => {
    const { el } = await mount({
      get: vi
        .fn()
        .mockRejectedValue(
          new HttpErrorResponse({ status: 404, error: { code: 'cookbook_not_found' } }),
        ),
    });
    expect(el.textContent).toContain(en.errors.cookbook_not_found);
  });
});
