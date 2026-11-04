import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { CookbookApi } from './cookbook.api';
import { CookbookSummary } from './cookbook.model';
import { MyCookbooksPage } from './my-cookbooks.page';

const sum = (over: Partial<CookbookSummary>): CookbookSummary => ({
  id: 'x', name: 'N', visibility: 'PRIVATE', role: 'OWNER', recipeCount: 0, coverThumbUrl: null,
  updatedAt: '2026-11-04T10:00:00Z', ...over,
});

function setup(api: Partial<CookbookApi>) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideTestTransloco(), { provide: CookbookApi, useValue: api }],
  });
}

describe('MyCookbooksPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('renders names, counts, role and visibility badges and links to the cookbook', async () => {
    setup({
      mine: async () => [
        sum({ id: 'a', name: 'Desserts', recipeCount: 1 }),
        sum({ id: 'b', name: 'Soups', role: 'AUTHOR', visibility: 'PUBLIC', recipeCount: 3 }),
      ],
    });
    const f = TestBed.createComponent(MyCookbooksPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain(en.cookbooks.title);
    const links = Array.from(el.querySelectorAll('a.cookbook')) as HTMLAnchorElement[];
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/cookbooks/a', '/cookbooks/b']);
    expect(links[0].textContent).toContain('Desserts');
    expect(links[0].textContent).toContain('1 recipe');
    expect(links[0].textContent).toContain(en.cookbooks.roleOwner);
    expect(links[0].textContent).toContain(en.cookbooks.visibility.PRIVATE);
    expect(links[1].textContent).toContain('3 recipes');
    expect(links[1].textContent).toContain(en.cookbooks.roleAuthor);
    expect(links[1].textContent).toContain(en.cookbooks.visibility.PUBLIC);
  });

  it('shows the cover thumb of a cookbook that has one', async () => {
    setup({ mine: async () => [sum({ id: 'a', coverThumbUrl: '/media/m1/thumb.jpg' }), sum({ id: 'b' })] });
    const f = TestBed.createComponent(MyCookbooksPage);
    await settle(f);
    const imgs = (f.nativeElement as HTMLElement).querySelectorAll('a.cookbook img.cover-thumb');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('/media/m1/thumb.jpg');
  });

  it('shows an empty state that invites creating a cookbook', async () => {
    setup({ mine: async () => [] });
    const f = TestBed.createComponent(MyCookbooksPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain(en.cookbooks.empty);
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes(en.cookbooks.new))).toBe(true);
  });

  it('+ New cookbook opens the form; creating navigates to the new cookbook', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new-id' });
    setup({ mine: async () => [], create });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(MyCookbooksPage);
    await settle(f);
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.new')!.click();
    await settle(f);
    const ov = document.querySelector('.cdk-overlay-container') as HTMLElement;
    const name = ov.querySelector('input[type="text"]') as HTMLInputElement;
    name.value = 'Desserts';
    name.dispatchEvent(new Event('input'));
    (ov.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(create).toHaveBeenCalledWith({ name: 'Desserts', description: null, visibility: 'PRIVATE' });
    expect(nav).toHaveBeenCalledWith('/cookbooks/new-id');
  });

  it('shows an error with retry when loading fails', async () => {
    const mine = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    setup({ mine });
    const f = TestBed.createComponent(MyCookbooksPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    el.querySelector<HTMLButtonElement>('button.retry')!.click();
    await settle(f);
    expect(mine).toHaveBeenCalledTimes(2);
  });
});
