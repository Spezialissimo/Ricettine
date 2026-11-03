import { toInput } from '../recipe.model';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { RecipeApi } from '../recipe.api';
import { Recipe } from '../recipe.model';
import { EditorStore, conflictText, isUntouchedDraft, withoutBlankIngredients } from './editor-store';
import { emptyInput, serverRecipe } from './editor-store.testing';

function setup(api: Partial<RecipeApi>) {
  TestBed.configureTestingModule({ providers: [EditorStore, { provide: RecipeApi, useValue: api }] });
  return TestBed.inject(EditorStore);
}

describe('EditorStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the server copy as the working RecipeInput', async () => {
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Lasagne', version: 3 })) });
    expect(store.loaded()).toBe(false);
    await store.load('r1');
    expect(store.loaded()).toBe(true);
    expect(store.id()).toBe('r1');
    expect(store.recipe()).toEqual(emptyInput({ title: 'Lasagne', version: 3 }));
    expect(store.server()?.status).toBe('DRAFT');
    expect(store.status()).toBe('idle');
  });

  it('reports a load failure', async () => {
    const store = setup({ get: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404, error: { code: 'recipe_not_found' } })) });
    await store.load('nope');
    expect(store.loaded()).toBe(false);
    expect(store.loadError()).toBe('errors.recipe_not_found');
  });

  it('update autosaves and keeps local edits made while the save was in flight', async () => {
    let resolve!: (r: Recipe) => void;
    const save = vi.fn().mockReturnValueOnce(new Promise<Recipe>((r) => (resolve = r)));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'A' }));
    expect(store.recipe().title).toBe('A');
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'A', version: 1 }));
    store.update((r) => ({ ...r, title: 'AB' }));
    save.mockResolvedValue(serverRecipe({ title: 'AB', version: 3 }));
    resolve(serverRecipe({ title: 'A', version: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.recipe()).toMatchObject({ title: 'AB', version: 2 }); // the echo never clobbers newer typing
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenLastCalledWith('r1', expect.objectContaining({ title: 'AB', version: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.recipe().version).toBe(3);
    expect(store.status()).toBe('saved');
  });

  it('exposes server field errors and clears them after a good save', async () => {
    const save = vi.fn().mockRejectedValueOnce(
      new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields: { title: 'required' } } }),
    ).mockResolvedValue(serverRecipe({ title: 'X', version: 2 }));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'T' })), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: '' }));
    await store.flush();
    expect(store.status()).toBe('error');
    expect(store.fieldErrors()).toEqual({ title: 'required' });
    expect(store.recipe().title).toBe('');
    store.update((r) => ({ ...r, title: 'X' }));
    await store.flush();
    expect(store.fieldErrors()).toEqual({});
  });

  it('loadLatest replaces the working copy and clears the conflict', async () => {
    const get = vi.fn().mockResolvedValueOnce(serverRecipe()).mockResolvedValueOnce(serverRecipe({ title: 'Theirs', version: 5 }));
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
    const store = setup({ get, save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Mine' }));
    await store.flush();
    expect(store.status()).toBe('conflict');
    await store.loadLatest();
    expect(store.status()).toBe('idle');
    expect(store.recipe()).toMatchObject({ title: 'Theirs', version: 5 });
  });

  it('keeps an edit typed while publish is in flight and saves it with the published version', async () => {
    let resolvePublish!: (r: Recipe) => void;
    const publish = vi.fn().mockReturnValue(new Promise<Recipe>((r) => (resolvePublish = r)));
    const save = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'T!', version: 3 }));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), save, publish });
    await store.load('r1');
    const epoch = store.epoch();
    const done = store.publish();
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledWith('r1', 1);
    store.update((r) => ({ ...r, title: 'T!' }));
    await vi.advanceTimersByTimeAsync(2000); // past the debounce: nothing may go out with the pre-publish version
    expect(save).not.toHaveBeenCalled();
    resolvePublish(serverRecipe({ status: 'PUBLISHED', title: 'T', version: 2 }));
    expect(await done).toBe('published');
    expect(store.recipe()).toMatchObject({ title: 'T!', version: 2 }); // typing kept, version adopted
    expect(store.server()?.status).toBe('PUBLISHED');
    expect(store.epoch()).toBe(epoch); // editors keep their local text
    expect(store.autosave.dirty()).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'T!', version: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
  });

  it('a publish with nothing typed meanwhile adopts the server copy', async () => {
    const publish = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Server', version: 2 }));
    const save = vi.fn();
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), save, publish });
    await store.load('r1');
    const epoch = store.epoch();
    expect(await store.publish()).toBe('published');
    expect(store.recipe()).toMatchObject({ title: 'Server', version: 2 });
    expect(store.epoch()).toBe(epoch + 1);
    expect(store.autosave.dirty()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('a failed publish resumes autosave for edits typed meanwhile', async () => {
    let rejectPublish!: (e: unknown) => void;
    const publish = vi.fn().mockReturnValue(new Promise<Recipe>((_, rej) => (rejectPublish = rej)));
    const save = vi.fn().mockResolvedValue(serverRecipe({ title: 'T!', version: 2 }));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), save, publish });
    await store.load('r1');
    const done = store.publish();
    await vi.advanceTimersByTimeAsync(0);
    store.update((r) => ({ ...r, title: 'T!' }));
    rejectPublish(new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields: { steps: 'required' } } }));
    await expect(done).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'T!', version: 1 }));
  });

  it('remove stops autosave and deletes the recipe', async () => {
    const save = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe()), save, remove });
    await store.load('r1');
    store.update((r) => ({ ...r, notes: 'x' }));
    await store.remove();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remove).toHaveBeenCalledWith('r1');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('withoutBlankIngredients', () => {
  it('holds back ingredient rows without a name, keeps everything else', () => {
    const ing = (name: string) => ({ amount: null, unit: null, name, note: null });
    const r = emptyInput({ title: 'T', groups: [{ name: 'A', ingredients: [ing('milk'), ing(' ')] }, { name: null, ingredients: [ing('')] }] });
    const out = withoutBlankIngredients(r);
    expect(out.groups).toEqual([{ name: 'A', ingredients: [ing('milk')] }, { name: null, ingredients: [] }]);
    expect(out.title).toBe('T');
    expect(r.groups[0].ingredients.length).toBe(2); // working copy untouched
  });
});

describe('isUntouchedDraft', () => {
  it('treats null and empty text the same (toInput normalizes a null title)', () => {
    const fresh = serverRecipe({ title: null });
    expect(toInput(fresh).title).toBe('');
    expect(isUntouchedDraft(fresh, toInput(fresh))).toBe(true);
    expect(isUntouchedDraft(serverRecipe({ title: '' }), toInput(serverRecipe({ title: '' })))).toBe(true);
  });
  it('is true only for a draft with every field empty or default', () => {
    expect(isUntouchedDraft(serverRecipe(), emptyInput())).toBe(true);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ source: '' , notes: '  ', title: ' ' }))).toBe(true);
    expect(isUntouchedDraft(serverRecipe({ status: 'PUBLISHED' }), emptyInput())).toBe(false);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ portions: 2 }))).toBe(false);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ prepMinutes: 5 }))).toBe(false);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ visibility: 'PUBLIC' }))).toBe(false);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ steps: [{ text: '', photoMediaId: null }] }))).toBe(false);
    expect(isUntouchedDraft(serverRecipe(), emptyInput({ groups: [{ name: null, ingredients: [] }] }))).toBe(false);
  });
});

describe('conflictText', () => {
  it('joins title, notes and step texts with blank lines, skipping empty ones', () => {
    const text = conflictText(emptyInput({
      title: 'Lasagne', notes: 'Less salt',
      steps: [{ text: 'Brown', photoMediaId: null }, { text: ' ', photoMediaId: null }, { text: 'Bake', photoMediaId: null }],
    }));
    expect(text).toBe('Lasagne\n\nLess salt\n\nBrown\n\nBake');
  });
});
