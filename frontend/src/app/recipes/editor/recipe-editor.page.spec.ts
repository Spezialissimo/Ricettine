import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { RecipeApi } from '../recipe.api';
import { Recipe } from '../recipe.model';
import { serverRecipe } from './editor-store.testing';
import { AuthStore } from '../../core/auth.store';
import { routes } from '../../app.routes';
import { leaveEditorGuard } from './leave-editor.guard';
import { RecipeEditorPage } from './recipe-editor.page';

async function mount(api: Partial<RecipeApi>, before: () => void = () => {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: RecipeApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r1' }) } } },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  before();
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
  it('keeps Publish disabled while a photo uploads, and says why', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { f, el } = await mount({
      get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })),
      uploadPhoto: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const publish = el.querySelector('button.publish') as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    const input = el.querySelector('.cover input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change'));
    await settle(f);
    expect(publish.disabled).toBe(true);
    expect(el.textContent).toContain(en.editor.waitingForUploads);
  });

  it('Done stays on the page with a message while a photo uploads', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { f, el, nav } = await mount({
      get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })),
      uploadPhoto: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const input = el.querySelector('.cover input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change'));
    await settle(f);
    byText(el.querySelector('.editor-header')!, 'button', en.editor.done)!.click();
    await settle(f);
    expect(nav).not.toHaveBeenCalled();
    expect(el.textContent).toContain(en.editor.uploadsInProgress);
  });

  it('explains visibility under the switch: private hides from the feed, public lists once published', async () => {
    const priv = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T', visibility: 'PRIVATE' })) });
    expect(priv.el.querySelector('.visibility-hint')?.textContent).toContain(en.editor.privateHint);
    (priv.el.querySelector('input[name="visibility"][value="PUBLIC"]') as HTMLInputElement).click();
    await settle(priv.f);
    expect(priv.el.querySelector('.visibility-hint')?.textContent).toContain(en.editor.publicHint);
  });

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
    expect(bar.querySelector('app-photo-picker button')?.textContent).toContain(en.editor.photo);
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
    expect(document.querySelector('app-confirm-dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('Done is ignored while the delete confirmation is open', async () => {
    const save = vi.fn();
    const remove = vi.fn();
    const { f, el, nav } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, remove });
    void f.componentInstance.confirmDelete();
    await settle(f);
    expect(document.querySelector('app-confirm-dialog')).toBeTruthy();
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
    expect(error.textContent).toContain(en.errors.field.required);
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
    const dialog = document.querySelector('app-confirm-dialog')!;
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

    it('an invalid amount shows a distinct status, and Publish refuses and focuses it', async () => {
      const publish = vi.fn();
      const get = vi.fn().mockResolvedValue(serverRecipe({ groups: [{ name: null, ingredients: [{ amount: 1, unit: null, name: 'milk', note: null }] }] }));
      const { f, el } = await mount({ get, save: vi.fn().mockResolvedValue(serverRecipe()), publish });
      const amount = el.querySelector('input.amount') as HTMLInputElement;
      type(amount, '2x');
      await settle(f);
      expect(el.querySelector('.editor-header [role="status"]')?.textContent).toContain(en.editor.status.invalid);
      expect(el.querySelector('.editor-header [role="status"]')?.textContent).not.toContain('✓');
      publishBtn(el)!.click();
      await settle(f);
      expect(publish).not.toHaveBeenCalled();
      expect(el.querySelector('.ingredients')!.classList.contains('missing')).toBe(true);
      expect(el.querySelector('.ingredients .section-error')?.textContent).toContain(en.editor.amountsInvalid);
      expect(document.activeElement).toBe(amount);
      type(amount, '2');
      await settle(f);
      expect(el.querySelector('.ingredients')!.classList.contains('missing')).toBe(false);
    });

    it('a 409 from Reset link moves the editor into conflict and disables Reset', async () => {
      const resetLink = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
      const { f, el } = await mount({
        get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'T', version: 2, shareUrl: 'https://x.test/r/OLD' })),
        resetLink,
      });
      byText(el, 'button', en.editor.resetLink)!.click();
      await settle(f);
      byText(document.querySelector('.cdk-overlay-container')!, 'button', en.editor.resetLinkConfirm.confirm)!.click();
      await settle(f);
      expect(resetLink).toHaveBeenCalledWith('r1', 2);
      expect(el.querySelector('.conflict')).toBeTruthy();
      expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/OLD');
      expect((byText(el, 'button', en.editor.resetLink) as HTMLButtonElement).disabled).toBe(true);
      expect(el.textContent).toContain(en.editor.resetLinkLoadLatest);
    });

    it('a 409 from publish moves the editor into conflict', async () => {
      const publish = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), publish });
      publishBtn(el)!.click();
      await settle(f);
      expect(el.querySelector('.conflict')).toBeTruthy();
      expect(el.querySelector('.editor-header [role="status"]')?.textContent).toContain(en.editor.status.conflict);
      expect(el.textContent).not.toContain(en.editor.publishBlocked); // the conflict banner is the message
    });

    it('clears the "not published" message once a later save succeeds', async () => {
      const save = vi.fn().mockRejectedValueOnce(new HttpErrorResponse({ status: 0 })).mockResolvedValue(serverRecipe({ version: 2 }));
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, publish: vi.fn() });
      type(el.querySelector('#recipe-title') as HTMLInputElement, 'T');
      publishBtn(el)!.click();
      await settle(f);
      expect(el.textContent).toContain(en.editor.publishBlocked);
      await f.componentInstance['store'].flush();
      await settle(f);
      expect(el.textContent).not.toContain(en.editor.publishBlocked);
    });

    describe('nameless ingredient rows', () => {
      const withRow = (row: object) =>
        serverRecipe({ groups: [{ name: null, ingredients: [{ amount: null, unit: null, name: 'milk', note: null }, row as never] }] });
      const statusText = (el: HTMLElement) => el.querySelector('.editor-header [role="status"]')?.textContent ?? '';

      it('a completely empty nameless row is invisible: normal status', async () => {
        const { el } = await mount({ get: vi.fn().mockResolvedValue(withRow({ amount: null, unit: null, name: '', note: null })) });
        expect(statusText(el)).not.toContain(en.editor.status.unnamedIngredient);
      });

      it('a nameless row with data shows its own status, Publish refuses and focuses its name', async () => {
        const publish = vi.fn();
        const get = vi.fn().mockResolvedValue(withRow({ amount: 2, unit: null, name: '', note: null }));
        const { f, el } = await mount({ get, publish, save: vi.fn() });
        expect(statusText(el)).toContain(en.editor.status.unnamedIngredient);
        expect(statusText(el)).not.toContain('✓');
        publishBtn(el)!.click();
        await settle(f);
        expect(publish).not.toHaveBeenCalled();
        expect(el.querySelector('.ingredients .section-error')?.textContent).toContain(en.editor.unnamedIngredientHint);
        expect(document.activeElement).toBe(el.querySelectorAll('input.name')[1]);
      });

      it('Done stays on the page with a warning', async () => {
        const get = vi.fn().mockResolvedValue(withRow({ amount: null, unit: 'g', name: '', note: null }));
        const { f, el, nav } = await mount({ get, save: vi.fn(), remove: vi.fn() });
        byText(el, 'button', en.editor.done)!.click();
        await settle(f);
        expect(nav).not.toHaveBeenCalled();
        expect(el.textContent).toContain(en.editor.unsavedInput);
      });

      it('naming the row clears the state', async () => {
        const get = vi.fn().mockResolvedValue(withRow({ amount: 2, unit: null, name: '', note: null }));
        const { f, el } = await mount({ get, save: vi.fn().mockResolvedValue(serverRecipe()) });
        type(el.querySelectorAll('input.name')[1] as HTMLInputElement, 'eggs');
        await settle(f);
        expect(statusText(el)).not.toContain(en.editor.status.unnamedIngredient);
      });
    });

    it('tells the person when Publish was declined because saving failed', async () => {
      const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
      const publish = vi.fn();
      const { f, el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe()), save, publish });
      type(el.querySelector('#recipe-title') as HTMLInputElement, 'T');
      publishBtn(el)!.click();
      await settle(f);
      expect(publish).not.toHaveBeenCalled();
      expect(el.textContent).toContain(en.editor.publishBlocked);
    });

    it('renders a fresh draft whose title the server sends as null', async () => {
      const { el } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: null })) });
      expect(el.querySelector('.steps')).toBeTruthy();
      expect(el.querySelector('#recipe-title-error')).toBeNull();
    });

    it('the bottom-bar camera button names its target step and hides the emoji from screen readers', async () => {
      const { f, el } = await mount({
        get: vi.fn().mockResolvedValue(serverRecipe({ steps: [{ text: 'a', photo: null }, { text: 'b', photo: null }] })),
      });
      const btn = () => el.querySelector('.bottom-bar app-photo-picker button') as HTMLButtonElement;
      expect(btn().getAttribute('aria-label')).toBe('Add photo to step 2');
      expect(btn().querySelector('[aria-hidden="true"]')?.textContent).toContain('📷');
      expect(btn().textContent).toContain(en.editor.photo);
      el.querySelectorAll('.steps li.step')[0].querySelector('textarea')!.dispatchEvent(new Event('focusin', { bubbles: true }));
      await settle(f);
      expect(btn().getAttribute('aria-label')).toBe('Add photo to step 1');
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

  describe('leaving and restoring', () => {
    const me = { id: 'u1', email: 'u1@x.test', username: 'u1', displayName: 'U', avatarUrl: null, admin: false };
    const putBackup = (title: string) =>
      localStorage.setItem('ricettine.unsaved.r1', JSON.stringify({ earlier: {
        input: { version: 1, title, portions: 1, prepMinutes: null, cookMinutes: null, source: null, notes: null,
          visibility: 'PRIVATE', coverMediaId: null, groups: [], steps: [] },
        baseVersion: 1, savedAt: Date.now(), userId: 'u1',
      } }));
    const failUpload = async (api: Partial<RecipeApi> = {}) => {
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
      const m = await mount({
        get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })),
        uploadPhoto: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 })),
        ...api,
      });
      TestBed.inject(AuthStore).setMe(me);
      const input = m.el.querySelector('.cover input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] });
      input.dispatchEvent(new Event('change'));
      await settle(m.f);
      return m;
    };
    afterEach(() => {
      localStorage.clear();
      TestBed.inject(AuthStore).setMe(null);
    });

    it('the editor route has the leave guard', () => {
      const find = (rs: typeof routes): (typeof routes)[number] | undefined =>
        rs.flatMap((r) => [r, ...(r.children ? [find(r.children)] : [])]).find((r) => r?.path === 'recipes/:id/edit');
      expect(find(routes)?.canDeactivate).toContain(leaveEditorGuard);
    });

    it('with a failed upload Publish stays disabled and says why', async () => {
      const { el } = await failUpload();
      expect((el.querySelector('button.publish') as HTMLButtonElement).disabled).toBe(true);
      expect(el.textContent).toContain(en.editor.uploadFailedHint);
    });

    it('leaving with a failed upload asks first; Stay keeps the page, Leave goes', async () => {
      const { f } = await failUpload();
      const first = f.componentInstance.canLeave();
      await settle(f);
      let dialog = document.querySelector('app-confirm-dialog')!;
      expect(dialog.textContent).toContain(en.editor.leaveConfirm.body);
      byText(dialog, 'button', en.editor.leaveConfirm.stay)!.click();
      expect(await first).toBe(false);

      const second = f.componentInstance.canLeave();
      await settle(f);
      dialog = document.querySelector('app-confirm-dialog')!;
      byText(dialog, 'button', en.editor.leaveConfirm.leave)!.click();
      expect(await second).toBe(true);
    });

    it('leaving with nothing pending does not ask', async () => {
      const { f } = await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })) });
      expect(await f.componentInstance.canLeave()).toBe(true);
    });

    it('leaving after the session ended does not ask, even with a failed upload', async () => {
      const failed = await failUpload();
      TestBed.inject(AuthStore).setMe(null); // session expired / logged out: the redirect must not be held up
      expect(await failed.f.componentInstance.canLeave()).toBe(true);
    });

    it('closing the tab with a failed upload asks for confirmation (beforeunload)', async () => {
      await failUpload();
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('closing the tab with nothing pending does not ask', async () => {
      await mount({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })) });
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    });

    it('a restored backup the server refuses shows the error with "Use saved version", which loads the saved copy', async () => {
      putBackup('');
      const get = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Saved' }));
      const { f, el } = await mount({
        get,
        save: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields: { title: 'required' } } })),
      }, () => TestBed.inject(AuthStore).setMe(me));
      await settle(f);
      expect((el.querySelector('#recipe-title') as HTMLInputElement).value).toBe('');
      expect(el.textContent).toContain(en.editor.restored);
      expect(el.textContent).not.toContain('being saved');
      byText(el, 'button', en.editor.useSaved)!.click();
      await settle(f);
      expect(get).toHaveBeenCalledTimes(2);
      expect((el.querySelector('#recipe-title') as HTMLInputElement).value).toBe('Saved');
      expect(byText(el, 'button', en.editor.useSaved)).toBeUndefined();
      expect(el.textContent).not.toContain(en.editor.restored);
      expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
    });

    it('says so when unsaved text from an earlier visit was restored', async () => {
      putBackup('Restored');
      const { el } = await mount({
        get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Old' })),
        save: vi.fn().mockResolvedValue(serverRecipe({ title: 'Restored', version: 2 })),
      }, () => TestBed.inject(AuthStore).setMe(me));
      expect((el.querySelector('#recipe-title') as HTMLInputElement).value).toBe('Restored');
      expect(el.textContent).toContain(en.editor.restored);
    });
  });
});
