import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { RecipeApi } from '../recipe.api';
import { Recipe } from '../recipe.model';
import { serverRecipe } from './editor-store.testing';
import { RecipeEditorPage } from './recipe-editor.page';

async function mount(api: Partial<RecipeApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: RecipeApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r1' }) } } },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(RecipeEditorPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}
const byText = (root: ParentNode, sel: string, text: string) =>
  Array.from(root.querySelectorAll(sel)).find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input'));
};

describe('RecipeEditorPage', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('loads the recipe into labelled fields laid out per the mockups', async () => {
    const { el } = await mount({
      get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Lasagne', notes: 'Less salt', visibility: 'PUBLIC' })),
    });
    const title = el.querySelector('#recipe-title') as HTMLInputElement;
    expect(title.value).toBe('Lasagne');
    expect(title.maxLength).toBe(200);
    expect(el.querySelector('label[for="recipe-title"]')?.textContent).toContain(en.editor.title);
    const notes = el.querySelector('#recipe-notes') as HTMLTextAreaElement;
    expect(notes.value).toBe('Less salt');
    expect(el.querySelector('label[for="recipe-notes"]')?.textContent).toContain(en.editor.notes);
    expect((el.querySelector('input[type="radio"][value="PUBLIC"]') as HTMLInputElement).checked).toBe(true);

    const left = el.querySelector('.col-left')!;
    const right = el.querySelector('.col-right')!;
    for (const sel of ['.cover', '.title-field', 'app-detail-chips', '.visibility', '.ingredients', '.notes']) {
      expect(left.querySelector(sel), sel).toBeTruthy();
    }
    expect(right.querySelector('.steps')).toBeTruthy();
    const bar = el.querySelector('.bottom-bar')!;
    expect(byText(bar, 'button', en.editor.photo)).toBeTruthy();
    expect(byText(bar, 'button', en.editor.nextStep)).toBeTruthy();
    const header = el.querySelector('.editor-header')!;
    expect(byText(header, 'button', en.editor.done)).toBeTruthy();
    expect(byText(header, 'button', en.editor.publish)).toBeTruthy();
    expect(header.querySelector('[role="status"]')).toBeTruthy();
  });

  it('edits title, visibility and notes through the store and shows Saved after the server confirms', async () => {
    const save = vi.fn().mockImplementation(async (_id: string, i: Recipe) => serverRecipe({ ...i, version: 2 } as never));
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    type(el.querySelector('#recipe-title') as HTMLInputElement, 'Tiramisù');
    (el.querySelector('input[type="radio"][value="PUBLIC"]') as HTMLInputElement).click();
    type(el.querySelector('#recipe-notes') as HTMLTextAreaElement, 'Use mascarpone');
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatchObject({ title: 'Tiramisù', visibility: 'PUBLIC', notes: 'Use mascarpone', version: 1 });
    expect(el.querySelector('.editor-header [role="status"]')?.textContent).toContain(en.editor.status.saved);
    expect(nav).toHaveBeenCalledWith('/recipes');
  });

  it('Done on a never-touched new draft deletes it instead of saving', async () => {
    const save = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, remove });
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(remove).toHaveBeenCalledWith('r1');
    expect(save).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/recipes');
  });

  it('Done on an empty local copy whose server version moved does not remove', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce(serverRecipe({ version: 1 }))
      .mockResolvedValue(serverRecipe({ version: 2, title: 'Filled on my phone' }));
    const save = vi.fn();
    const remove = vi.fn();
    const { f, el, nav } = await mount({ get, save, remove });
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(get).toHaveBeenCalledTimes(2); // re-checked the server copy before deleting
    expect(remove).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/recipes');
  });

  it('Done on an empty local copy does not remove when the server copy has content at the same version', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce(serverRecipe({ version: 3 }))
      .mockResolvedValue(serverRecipe({ version: 3, notes: 'x' }));
    const remove = vi.fn();
    const { f, el } = await mount({ get, remove, save: vi.fn() });
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(remove).not.toHaveBeenCalled();
  });

  it('Done during a conflict does not remove, even with an empty local copy', async () => {
    const get = vi.fn().mockResolvedValue(serverRecipe());
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
    const remove = vi.fn();
    const { f, el, nav } = await mount({ get, save, remove });
    const title = el.querySelector('#recipe-title') as HTMLInputElement;
    type(title, 'typed');
    await f.componentInstance['store'].flush();
    type(title, ''); // local copy is empty again, but the save 409'd
    await settle(f);
    expect(el.querySelector('.conflict')).toBeTruthy();
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(remove).not.toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('Done and Delete share one busy guard', async () => {
    const save = vi.fn().mockReturnValue(new Promise(() => {})); // a save that never answers
    const remove = vi.fn();
    const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'X' })), save, remove });
    type(el.querySelector('#recipe-title') as HTMLInputElement, 'Y');
    void f.componentInstance.done();
    await settle(f);
    await f.componentInstance.confirmDelete(); // ignored while Done is running
    await settle(f);
    expect(document.querySelector('app-confirm-delete-dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('Done is ignored while the delete confirmation is open', async () => {
    const save = vi.fn();
    const remove = vi.fn();
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, remove });
    void f.componentInstance.confirmDelete();
    await settle(f);
    expect(document.querySelector('app-confirm-delete-dialog')).toBeTruthy();
    expect((byText(el, 'button', en.editor.done) as HTMLButtonElement).disabled).toBe(true);
    await f.componentInstance.done();
    expect(remove).not.toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('marks the title invalid with a described error when the server rejects it', async () => {
    const save = vi.fn().mockRejectedValue(
      new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields: { title: 'required' } } }),
    );
    const { f, el, nav } = await mount({
      get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Old' })),
      save,
    });
    const title = el.querySelector('#recipe-title') as HTMLInputElement;
    expect(title.getAttribute('aria-invalid')).toBe('false');
    type(title, '');
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(nav).not.toHaveBeenCalled(); // nothing is lost: we stay on the page
    expect(title.getAttribute('aria-invalid')).toBe('true');
    const errorId = title.getAttribute('aria-describedby')!;
    const error = el.querySelector(`#${errorId}`)!;
    expect(error.textContent).toContain(en.editor.field.required);
    expect(error.closest('label')).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.recipe_incomplete);
    expect(title.value).toBe('');
  });

  it('on conflict shows the copyable unsaved text, and Load latest reloads the server copy', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce(serverRecipe({ title: 'Base', steps: [{ text: 'Mix', photo: null }] }))
      .mockResolvedValueOnce(serverRecipe({ title: 'Theirs', version: 4 }));
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
    const { f, el, nav } = await mount({ get, save });
    type(el.querySelector('#recipe-title') as HTMLInputElement, 'Mine');
    type(el.querySelector('#recipe-notes') as HTMLTextAreaElement, 'My notes');
    byText(el, 'button', en.editor.done)!.click();
    await settle(f);
    expect(nav).not.toHaveBeenCalled();
    const banner = el.querySelector('.conflict')!;
    expect(banner.textContent).toContain(en.editor.conflict);
    const copy = banner.querySelector('textarea') as HTMLTextAreaElement;
    expect(copy.readOnly).toBe(true);
    expect(copy.value).toBe('Mine\n\nMy notes\n\nMix');
    expect(banner.querySelector(`label[for="${copy.id}"]`)).toBeTruthy();

    byText(banner, 'button', en.editor.loadLatest)!.click();
    await settle(f);
    expect(get).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.conflict')).toBeNull();
    expect((el.querySelector('#recipe-title') as HTMLInputElement).value).toBe('Theirs');
  });

  it('Delete in the overflow menu asks for confirmation, deletes and goes to My recipes', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'X' })), remove });
    (el.querySelector(`button[aria-label="${en.editor.more}"]`) as HTMLButtonElement).click();
    await settle(f);
    byText(document, '[role="menuitem"]', en.editor.delete)!.click();
    await settle(f);
    const dialog = document.querySelector('app-confirm-delete-dialog')!;
    expect(dialog.textContent).toContain(en.editor.deleteConfirm.title);
    expect(remove).not.toHaveBeenCalled();
    byText(dialog, 'button', en.editor.deleteConfirm.confirm)!.click();
    await settle(f);
    expect(remove).toHaveBeenCalledWith('r1');
    expect(nav).toHaveBeenCalledWith('/recipes');
  });

  it('shows the load error', async () => {
    const { el } = await mount({
      get: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404, error: { code: 'recipe_not_found' } })),
    });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.recipe_not_found);
  });

  describe('publishing', () => {
    const incomplete = (fields: Record<string, string>) =>
      new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields } });
    const publishBtn = (el: HTMLElement) => byText(el.querySelector('.editor-header')!, 'button', en.editor.publish);

    it('flushes pending changes, then publishes at the saved version and adopts the result', async () => {
      const order: string[] = [];
      const save = vi.fn().mockImplementation(async (_id: string, i: Recipe) => {
        order.push('save');
        return serverRecipe({ ...(i as object), version: 2 } as never);
      });
      const publish = vi.fn().mockImplementation(async () => {
        order.push('publish');
        return serverRecipe({ status: 'PUBLISHED', title: 'T', version: 3, groups: [{ name: null, ingredients: [{ amount: null, unit: null, name: 'a', note: null }] }], steps: [{ text: 's', photo: null }] });
      });
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, publish });
      type(el.querySelector('#recipe-title') as HTMLInputElement, 'T');
      publishBtn(el)!.click();
      await settle(f);
      expect(order).toEqual(['save', 'publish']);
      expect(publish).toHaveBeenCalledWith('r1', 2);
      expect(publishBtn(el)).toBeUndefined();
      expect(el.querySelector('.editor-header .state')?.textContent).toContain('Published · Private');
      expect((el.querySelector('#recipe-title') as HTMLInputElement).value).toBe('T');
    });

    it('does not publish when the flush ends in a conflict', async () => {
      const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
      const publish = vi.fn();
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, publish });
      type(el.querySelector('#recipe-title') as HTMLInputElement, 'T');
      publishBtn(el)!.click();
      await settle(f);
      expect(publish).not.toHaveBeenCalled();
    });

    it('recipe_incomplete highlights the missing sections with the message and scrolls to the first', async () => {
      const publish = vi.fn().mockRejectedValue(incomplete({ steps: 'required' }));
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), save: vi.fn(), publish });
      const scroll = vi.fn();
      (el.querySelector('#steps-heading') as HTMLElement).scrollIntoView = scroll;
      publishBtn(el)!.click();
      await settle(f);
      const steps = el.querySelector('.steps')!;
      expect(steps.classList.contains('missing')).toBe(true);
      expect(steps.querySelector('.section-error')?.textContent).toContain(en.errors.recipe_incomplete);
      expect(el.querySelector('.ingredients')?.classList.contains('missing')).toBe(false);
      expect(scroll).toHaveBeenCalled();
      // fixing it clears the highlight
      steps.querySelector<HTMLButtonElement>('button.add-step')!.click();
      await settle(f);
      type(steps.querySelector('textarea') as HTMLTextAreaElement, 'Boil');
      await settle(f);
      expect(el.querySelector('.steps')!.classList.contains('missing')).toBe(false);
    });

    it('a published recipe with an empty title shows recipe_incomplete under the title', async () => {
      const { el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: '' })) });
      const input = el.querySelector('#recipe-title') as HTMLInputElement;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(el.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain(en.errors.recipe_incomplete);
    });

    it('renders a fresh draft whose title the server sends as null', async () => {
      const { el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: null as never })) });
      expect(el.querySelector('.steps')).toBeTruthy();
      expect(el.querySelector('#recipe-title-error')).toBeNull();
    });

    it('the bottom-bar "+ Next step" adds a step', async () => {
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()) });
      const next = byText(el.querySelector('.bottom-bar')!, 'button', en.editor.nextStep) as HTMLButtonElement;
      expect(next.disabled).toBe(false);
      next.click();
      await settle(f);
      expect(el.querySelectorAll('.steps textarea').length).toBe(1);
    });
  });
});
