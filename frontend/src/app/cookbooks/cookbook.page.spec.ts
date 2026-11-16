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

async function mount(api: Partial<CookbookApi>, mode: 'view' | 'edit' = 'edit') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: CookbookApi, useValue: { invites: vi.fn().mockResolvedValue([]), ...api } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: 'c1' }),
            data: mode === 'edit' ? { mode: 'edit' } : {},
          },
        },
      },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(CookbookPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}

describe('CookbookPage: /cookbooks/:id (view)', () => {
  it('forwards to the one view of the cookbook, its share link, replacing the history entry', async () => {
    const { el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()) }, 'view');
    expect(nav).toHaveBeenCalledWith('/c/TOK', { replaceUrl: true });
    expect(el.querySelector('app-cookbook-hero')).toBeNull();
  });

  it('without a share link shows the fallback view: banner, description, recipe cards and Edit', async () => {
    const { el, nav } = await mount(
      { get: vi.fn().mockResolvedValue(book({ shareUrl: null })) },
      'view',
    );
    expect(nav).not.toHaveBeenCalled();
    expect(el.querySelector('app-cookbook-hero h1')?.textContent).toContain('Desserts');
    expect(el.querySelector('app-cookbook-hero .facts')?.textContent).toContain('2 recipes');
    expect(el.querySelector('app-cookbook-hero .facts')?.textContent).toContain(
      en.cookbooks.visibility.PRIVATE,
    );
    expect(el.querySelector('.book-desc')?.textContent).toContain('Sweet');
    const edit = Array.from(el.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === en.cookbooks.edit,
    );
    expect(edit?.getAttribute('href')).toBe('/cookbooks/c1/edit');
    // own recipes open their recipe page; others are not openable without a link
    const cards = Array.from(el.querySelectorAll('app-cookbook-recipe-cards li'));
    expect(cards[0].querySelector('a.recipe-card')?.getAttribute('href')).toBe('/recipes/r1/view');
    expect(cards[1].querySelector('a.recipe-card')).toBeNull();
  });
});

describe('CookbookPage: /cookbooks/:id/edit', () => {
  afterEach(clearOverlays);

  it('renders the edit page: entries open through the cookbook link, no Edit links into the editor', async () => {
    const { el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()) });
    expect(nav).not.toHaveBeenCalled();
    expect(el.querySelector('h1')?.textContent).toContain(en.titles.cookbookEdit);
    const items = Array.from(el.querySelectorAll('li.entry')) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r1');
    expect(el.querySelector('a[href$="/edit"]')).toBeNull();
    expect(items[0].textContent).toContain('ANN');
    expect(items[1].querySelector('a.entry-title')?.getAttribute('href')).toBe('/c/TOK/r/r2');
    expect(items[1].textContent).toContain('Panna cotta');
    expect(items[1].textContent).toContain('BOB');
    expect(items[1].textContent).toContain(en.cookbooks.deletedUser);
  });

  it('without a share link, own entries open their recipe page and others are plain text', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book({ shareUrl: null })) });
    const items = Array.from(el.querySelectorAll('li.entry')) as HTMLElement[];
    expect(items[0].querySelector('a.entry-title')?.getAttribute('href')).toBe('/recipes/r1/view');
    expect(items[1].querySelector('a.entry-title')).toBeNull();
    expect(items[1].querySelector('span.entry-title')?.textContent).toContain('Panna cotta');
  });

  it('shows the thumbnail when there is one', async () => {
    const { el } = await mount({
      get: vi
        .fn()
        .mockResolvedValue(
          book({ role: 'AUTHOR', recipes: [entry({ coverThumbUrl: '/media/m/THUMB.jpg?c=TOK' })] }),
        ),
    });
    expect(el.querySelector('li.entry img')?.getAttribute('src')).toBe('/media/m/THUMB.jpg?c=TOK');
  });

  it('an AUTHOR gets no details form and no Delete, but keeps Remove and Save', async () => {
    const { el } = await mount({ get: vi.fn().mockResolvedValue(book({ role: 'AUTHOR' })) });
    expect(el.querySelector('#cb-name')).toBeNull();
    expect(btn(el, en.cookbooks.delete)).toBeUndefined();
    expect(el.querySelector('p.by')?.textContent).toContain('Desserts');
    expect(btn(el, 'Remove Tiramisu')).toBeTruthy();
    expect(btn(el, en.cookbooks.save)).toBeTruthy();
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
    expect(nav).toHaveBeenCalledWith('/kitchen/cookbooks');
  });

  describe('the details, edited in place (owner)', () => {
    const type = (el: HTMLElement, sel: string, value: string) => {
      const i = el.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
      i.value = value;
      i.dispatchEvent(new Event('input'));
    };

    it('are filled from the cookbook, with labelled fields and the visibility choice', async () => {
      const { el } = await mount({ get: vi.fn().mockResolvedValue(book()) });
      const name = el.querySelector('#cb-name') as HTMLInputElement;
      expect(name.value).toBe('Desserts');
      expect(el.querySelector('label[for="cb-name"]')?.textContent).toContain(en.cookbooks.name);
      expect((el.querySelector('#cb-desc') as HTMLTextAreaElement).value).toBe('Sweet');
      const checked = el.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      expect(checked?.value).toBe('PRIVATE');
    });

    it('Save patches what changed, then returns to the view', async () => {
      const patch = vi.fn().mockResolvedValue(book({ name: 'Sweets', visibility: 'PUBLIC' }));
      const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()), patch });
      type(el, '#cb-name', '  Sweets ');
      (el.querySelector('input[type="radio"][value="PUBLIC"]') as HTMLInputElement).click();
      btn(el, en.cookbooks.save)!.click();
      await settle(f);
      expect(patch).toHaveBeenCalledWith('c1', {
        name: 'Sweets',
        description: 'Sweet',
        visibility: 'PUBLIC',
      });
      expect(nav).toHaveBeenCalledWith('/cookbooks/c1');
    });

    it('a reload after a member change keeps what the owner typed', async () => {
      const get = vi.fn().mockResolvedValue(book());
      const patch = vi.fn().mockResolvedValue(book({ name: 'Sweets' }));
      const { f, el } = await mount({ get, patch });
      type(el, '#cb-name', 'Sweets');
      type(el, '#cb-desc', 'Very sweet');
      await f.componentInstance.load(); // what the members panel's (changed) runs
      await settle(f);
      expect(get).toHaveBeenCalledTimes(2);
      expect((el.querySelector('#cb-name') as HTMLInputElement).value).toBe('Sweets');
      expect((el.querySelector('#cb-desc') as HTMLTextAreaElement).value).toBe('Very sweet');
      btn(el, en.cookbooks.save)!.click();
      await settle(f);
      expect(patch).toHaveBeenCalledWith('c1', {
        name: 'Sweets',
        description: 'Very sweet',
        visibility: 'PRIVATE',
      });
    });

    it('Save with nothing changed returns to the view without a request', async () => {
      const patch = vi.fn();
      const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()), patch });
      btn(el, en.cookbooks.save)!.click();
      await settle(f);
      expect(patch).not.toHaveBeenCalled();
      expect(nav).toHaveBeenCalledWith('/cookbooks/c1');
    });

    it('a blank name or an over-long description stays, with the error under the field', async () => {
      const patch = vi.fn();
      const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()), patch });
      type(el, '#cb-name', '   ');
      type(el, '#cb-desc', 'x'.repeat(1001));
      btn(el, en.cookbooks.save)!.click();
      await settle(f);
      expect(patch).not.toHaveBeenCalled();
      expect(nav).not.toHaveBeenCalled();
      const name = el.querySelector('#cb-name')!;
      expect(name.getAttribute('aria-invalid')).toBe('true');
      expect(name.getAttribute('aria-describedby')).toBe('cb-name-err');
      expect(el.querySelector('#cb-name-err')?.textContent?.trim()).toBeTruthy();
      expect(el.querySelector('#cb-desc')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('a server field error is shown under its field and Save stays', async () => {
      const patch = vi.fn().mockRejectedValue(
        new HttpErrorResponse({
          status: 400,
          error: { code: 'validation_failed', fields: { name: 'too_long' } },
        }),
      );
      const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(book()), patch });
      type(el, '#cb-name', 'Other');
      btn(el, en.cookbooks.save)!.click();
      await settle(f);
      expect(nav).not.toHaveBeenCalled();
      expect(el.querySelector('#cb-name')?.getAttribute('aria-invalid')).toBe('true');
    });
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
