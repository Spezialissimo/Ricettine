import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { AddToCookbookDialog } from './add-to-cookbook.dialog';
import { CookbookApi } from './cookbook.api';
import { CookbookSummary } from './cookbook.model';

const sum = (id: string, name: string): CookbookSummary => ({
  id, name, visibility: 'PRIVATE', role: 'OWNER', recipeCount: 0, coverThumbUrl: null, updatedAt: '2026-11-04T10:00:00Z',
});

async function open(api: Partial<CookbookApi>, ref = { recipeId: 'r1' }) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco(), { provide: CookbookApi, useValue: api }] });
  TestBed.inject(Dialog).open(AddToCookbookDialog, { data: { ref } });
  const f = { whenStable: () => Promise.resolve() };
  await settle(f);
  return { ov: document.querySelector('.cdk-overlay-container') as HTMLElement, f };
}
const add = (ov: HTMLElement, name: string) =>
  ov.querySelector<HTMLButtonElement>(`button[aria-label="${en.cookbooks.addTo.replace('{{name}}', name)}"]`)!;

describe('AddToCookbookDialog', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows "Added" on 201 and "Already in this cookbook" on 200', async () => {
    const addRecipe = vi.fn()
      .mockResolvedValueOnce({ entry: {}, created: true })
      .mockResolvedValueOnce({ entry: {}, created: false });
    const { ov, f } = await open({ mine: async () => [sum('a', 'Desserts'), sum('b', 'Soups')], addRecipe });
    add(ov, 'Desserts').click();
    await settle(f);
    add(ov, 'Soups').click();
    await settle(f);
    expect(addRecipe).toHaveBeenNthCalledWith(1, 'a', { recipeId: 'r1' });
    const rows = ov.querySelectorAll('li');
    expect(rows[0].textContent).toContain(en.cookbooks.added);
    expect(rows[1].textContent).toContain(en.cookbooks.alreadyIn);
    expect(add(ov, 'Desserts')).toBeNull();
  });

  it('shows the error of a failed add on its row', async () => {
    const addRecipe = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'cookbook_full' } }));
    const { ov, f } = await open({ mine: async () => [sum('a', 'Desserts')], addRecipe });
    add(ov, 'Desserts').click();
    await settle(f);
    expect(ov.querySelector('[role="alert"]')?.textContent).toContain(en.errors.cookbook_full);
  });

  it('passes a share token ref through', async () => {
    const addRecipe = vi.fn().mockResolvedValue({ entry: {}, created: true });
    const { ov, f } = await open({ mine: async () => [sum('a', 'Desserts')], addRecipe }, { shareToken: 'tok' } as never);
    add(ov, 'Desserts').click();
    await settle(f);
    expect(addRecipe).toHaveBeenCalledWith('a', { shareToken: 'tok' });
  });

  it('+ New cookbook creates the cookbook and adds the recipe to it', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'n1', name: 'Fresh', visibility: 'PRIVATE', role: 'OWNER' });
    const addRecipe = vi.fn().mockResolvedValue({ entry: {}, created: true });
    const { ov, f } = await open({ mine: async () => [], create, addRecipe });
    ov.querySelector<HTMLButtonElement>('button.new')!.click();
    await settle(f);
    const form = ov.querySelectorAll('.cdk-dialog-container')[1] ?? ov;
    const name = form.querySelector('input[type="text"]') as HTMLInputElement;
    name.value = 'Fresh';
    name.dispatchEvent(new Event('input'));
    (form.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle(f);
    expect(create).toHaveBeenCalledWith({ name: 'Fresh', description: null, visibility: 'PRIVATE' });
    expect(addRecipe).toHaveBeenCalledWith('n1', { recipeId: 'r1' });
    expect(ov.textContent).toContain('Fresh');
    expect(ov.textContent).toContain(en.cookbooks.added);
  });
});
