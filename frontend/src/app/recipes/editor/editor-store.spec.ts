import { toInput } from '../recipe.model';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth.store';
import { PendingSaves } from '../../core/pending-saves';
import { RecipeApi } from '../recipe.api';
import { Recipe } from '../recipe.model';
import { EditorStore, conflictText, isUntouchedDraft, withoutBlankIngredients } from './editor-store';
import { emptyInput, serverRecipe } from './editor-store.testing';
import { Backup } from './unsaved-backup';

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

  it('resetLink adopts the new version and share URL without overwriting pending edits, so the next save succeeds', async () => {
    const resetLink = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Server', version: 3, shareUrl: 'https://x.test/r/NEW' }));
    const save = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Typed', version: 4, shareUrl: 'https://x.test/r/NEW' }));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'T', version: 2, shareUrl: 'https://x.test/r/OLD' })), save, resetLink });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Typed' }));
    await store.resetLink();
    expect(resetLink).toHaveBeenCalledWith('r1');
    expect(store.server()?.shareUrl).toBe('https://x.test/r/NEW');
    expect(store.recipe()).toMatchObject({ title: 'Typed', version: 3 });
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Typed', version: 3 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
  });

  it('a failed resetLink resumes autosave and rethrows', async () => {
    const resetLink = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    const save = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Typed', version: 3 }));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'T', version: 2 })), save, resetLink });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Typed' }));
    await expect(store.resetLink()).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
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

  it('PendingSaves.flushAll sends what is typed in an open editor and waits for the answer', async () => {
    let resolve!: (r: Recipe) => void;
    const save = vi.fn().mockReturnValue(new Promise<Recipe>((r) => (resolve = r)));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    const pending = TestBed.inject(PendingSaves);
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Typed' }));
    let done = false;
    const all = pending.flushAll().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0); // no debounce wait
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Typed' }));
    expect(done).toBe(false);
    resolve(serverRecipe({ title: 'Typed', version: 2 }));
    await all;
    expect(store.status()).toBe('saved');
  });

  it('a destroyed editor stays tracked until its leaving flush settles', async () => {
    let resolve!: (r: Recipe) => void;
    const save = vi.fn().mockReturnValue(new Promise<Recipe>((r) => (resolve = r)));
    const store = setup({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    const pending = TestBed.inject(PendingSaves);
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Typed' }));
    TestBed.resetTestingModule(); // leaving the page: the destroy-flush starts
    expect(save).toHaveBeenCalledTimes(1);
    let done = false;
    const all = pending.flushAll().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    resolve(serverRecipe({ title: 'Typed', version: 2 }));
    await all;
    expect(done).toBe(true);
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

describe('EditorStore unsaved backup', () => {
  const KEY = 'ricettine.unsaved.r1';
  const me = (id: string) => ({ id, email: `${id}@x.test`, username: id, displayName: id, avatarUrl: null, admin: false });
  /** The newest backup entry of r1 (any tab), or null. */
  const stored = (key = KEY) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entries = Object.values(JSON.parse(raw) as Record<string, Backup>);
    return entries.length ? entries.reduce((a, b) => (b.savedAt >= a.savedAt ? b : a)) : null;
  };
  const putBackup = (input: Partial<ReturnType<typeof emptyInput>>, baseVersion: number, userId = 'u1', writer = 'earlier-visit',
    amountTexts?: Record<string, string>) =>
    localStorage.setItem(KEY, JSON.stringify({
      ...JSON.parse(localStorage.getItem(KEY) ?? '{}'),
      [writer]: { input: emptyInput({ ...input, version: baseVersion }), baseVersion, savedAt: Date.now(), userId, amountTexts },
    }));
  function setupAs(api: Partial<RecipeApi>, userId: string | null = 'u1') {
    const store = setup(api);
    TestBed.inject(AuthStore).setMe(userId ? me(userId) : null);
    return store;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('an edit while the network fails: backup written, offline; an online event saves it and deletes the backup', async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ version: 3 })), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Offline pie' }));
    expect(stored()).toMatchObject({ input: { title: 'Offline pie' }, baseVersion: 3, userId: 'u1' }); // before any request
    await vi.advanceTimersByTimeAsync(800);
    expect(store.status()).toBe('offline');
    expect(stored()?.input.title).toBe('Offline pie');

    save.mockResolvedValue(serverRecipe({ title: 'Offline pie', version: 4 }));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
    expect(stored()).toBeNull();
  });

  it('a backup with the same base version is applied at load and saved', async () => {
    putBackup({ title: 'Typed before the tab closed', notes: 'n' }, 3);
    const save = vi.fn().mockResolvedValue(serverRecipe({ title: 'Typed before the tab closed', notes: 'n', version: 4 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Old', version: 3 })), save });
    await store.load('r1');
    expect(store.recipe()).toMatchObject({ title: 'Typed before the tab closed', notes: 'n', version: 3 });
    expect(store.restored()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Typed before the tab closed', version: 3 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
    expect(stored()).toBeNull();
  });

  it('a backup with an older base version shows the conflict with the backup text; Load latest drops it', async () => {
    putBackup({ title: 'My offline text', steps: [{ text: 'Stir', photoMediaId: null }] }, 2);
    const save = vi.fn();
    const get = vi.fn().mockResolvedValue(serverRecipe({ title: 'Theirs', version: 5 }));
    const store = setupAs({ get, save });
    await store.load('r1');
    expect(store.status()).toBe('conflict');
    expect(conflictText(store.recipe())).toBe('My offline text\n\nStir');
    store.update((r) => ({ ...r, notes: 'more' })); // still kept locally during the conflict
    expect(stored()).toMatchObject({ input: { notes: 'more' }, baseVersion: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();

    await store.loadLatest();
    expect(store.recipe().title).toBe('Theirs');
    expect(stored()).toBeNull();
  });

  it('a backup that matches the server copy is dropped without a save or a notice', async () => {
    putBackup({ title: 'Same' }, 2);
    const save = vi.fn();
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Same', version: 3 })), save });
    await store.load('r1');
    expect(store.status()).toBe('idle');
    expect(store.restored()).toBe(false);
    expect(stored()).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('two tabs on one recipe: A saving never erases the text of B, which is in a conflict', async () => {
    const save = vi.fn().mockImplementation(async (_id: string, i: { title: string }) => {
      if (i.title === 'B text') throw new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } });
      return serverRecipe({ title: i.title, version: 2 });
    });
    const api = { get: vi.fn().mockResolvedValue(serverRecipe()), save };
    TestBed.configureTestingModule({ providers: [{ provide: RecipeApi, useValue: api }] });
    TestBed.inject(AuthStore).setMe(me('u1'));
    const tabA = TestBed.runInInjectionContext(() => new EditorStore());
    const tabB = TestBed.runInInjectionContext(() => new EditorStore());
    await tabA.load('r1');
    await tabB.load('r1');
    tabB.update((r) => ({ ...r, title: 'B text' }));
    await tabB.flush();
    expect(tabB.status()).toBe('conflict');
    tabA.update((r) => ({ ...r, title: 'A text' }));
    await tabA.flush();
    expect(tabA.status()).toBe('saved');
    // B leaves during its conflict (its flush is blocked): its text is still there
    expect(stored()?.input.title).toBe('B text');
    const tabC = TestBed.runInInjectionContext(() => new EditorStore());
    api.get.mockResolvedValue(serverRecipe({ title: 'A text', version: 2 }));
    await tabC.load('r1');
    expect(tabC.status()).toBe('conflict');
    expect(conflictText(tabC.recipe())).toBe('B text');
  });

  it("entering a conflict writes this tab's backup again (e.g. after another tab opened the recipe and took the entry over)", async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 409, error: { code: 'recipe_conflict' } }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Mine' }));
    localStorage.removeItem(KEY); // another tab restored it into its own entry, then discarded it
    await store.flush();
    expect(store.status()).toBe('conflict');
    expect(stored()?.input.title).toBe('Mine');
  });

  it('a nameless ingredient row holding an amount is never sent, so the backup keeps it and a reload restores it', async () => {
    const save = vi.fn().mockResolvedValue(serverRecipe({ title: 'T', version: 2, groups: [{ name: null, ingredients: [] }] }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'T', groups: [{ name: null, ingredients: [{ amount: 2, unit: 'g', name: '', note: null }] }] }));
    await store.flush();
    expect(store.autosave.dirty()).toBe(false);
    expect(stored()?.input.groups[0].ingredients[0]).toMatchObject({ amount: 2, unit: 'g', name: '' });

    TestBed.resetTestingModule();
    const again = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T', version: 2, groups: [{ name: null, ingredients: [] }] })), save });
    await again.load('r1');
    expect(again.recipe().groups[0].ingredients[0]).toMatchObject({ amount: 2, unit: 'g', name: '' });
    expect(again.unnamedIngredients()).toBe(1);
  });

  it('invalid amount text is kept in the backup and handed back on reload', async () => {
    const save = vi.fn().mockResolvedValue(serverRecipe({ version: 2, groups: [{ name: null, ingredients: [{ amount: 1, unit: null, name: 'milk', note: null }] }] }));
    const ing = { amount: 1, unit: null, name: 'milk', note: null };
    const server = serverRecipe({ groups: [{ name: null, ingredients: [ing] }] });
    const store = setupAs({ get: vi.fn().mockResolvedValue(server), save });
    await store.load('r1');
    store.setInvalidAmounts({ '0.0': '1//2' });
    expect(stored()?.amountTexts).toEqual({ '0.0': '1//2' });
    expect(store.invalidAmounts()).toBe(1);

    TestBed.resetTestingModule();
    const again = setupAs({ get: vi.fn().mockResolvedValue(server), save });
    await again.load('r1');
    expect(again.restoredAmountTexts()).toEqual({ '0.0': '1//2' });
    expect(again.restored()).toBe(true);
  });

  it('a restored backup the server refuses (4xx) offers the saved version, which discards it', async () => {
    putBackup({ title: '' }, 1);
    const get = vi.fn().mockResolvedValue(serverRecipe({ status: 'PUBLISHED', title: 'Saved', version: 1 }));
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 400, error: { code: 'recipe_incomplete', fields: { title: 'required' } } }));
    const store = setupAs({ get, save });
    await store.load('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('error');
    expect(store.restoreRefused()).toBe(true);
    await store.loadLatest();
    expect(store.recipe().title).toBe('Saved');
    expect(store.restored()).toBe(false);
    expect(store.restoreRefused()).toBe(false);
    expect(stored()).toBeNull();
  });

  it('an 8-day-old backup is discarded on load', async () => {
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify({ old: {
      input: emptyInput({ title: 'Ancient', version: 3 }), baseVersion: 3, savedAt: now - 8 * 24 * 60 * 60 * 1000, userId: 'u1',
    } }));
    const save = vi.fn();
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Server', version: 3 })), save });
    await store.load('r1');
    expect(store.recipe().title).toBe('Server');
    expect(store.restored()).toBe(false);
    expect(stored()).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('PendingSaves.flushAll is not clean while an editor still has unsaved text', async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Unsent' }));
    expect(await TestBed.inject(PendingSaves).flushAll()).toBe(false);
    save.mockResolvedValue(serverRecipe({ title: 'Unsent', version: 2 }));
    expect(await TestBed.inject(PendingSaves).flushAll()).toBe(true);
  });

  it('a clean logout flush clears the open recipe\'s backup only; a backup of a recipe not open survives', async () => {
    const other = 'ricettine.unsaved.rB';
    localStorage.setItem(other, JSON.stringify({ tabX: { input: emptyInput({ title: 'B text' }), baseVersion: 1, savedAt: Date.now(), userId: 'u1' } }));
    const save = vi.fn().mockResolvedValue(serverRecipe({ title: 'A text', version: 2 }));
    TestBed.configureTestingModule({
      providers: [EditorStore, { provide: RecipeApi, useValue: { get: vi.fn().mockResolvedValue(serverRecipe()), save } },
        provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(EditorStore);
    const auth = TestBed.inject(AuthStore);
    auth.setMe(me('u1'));
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'A text' }));
    expect(stored()).not.toBeNull();
    const out = auth.logout();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.inject(HttpTestingController).expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await out;
    expect(auth.me()).toBeNull();
    expect(stored()).toBeNull(); // A: saved by this logout's flush
    expect(stored(other)?.input.title).toBe('B text'); // B: never restored, kept until it expires
  });

  it('a clean flush never deletes a backup this editor did not write (e.g. another tab typing offline)', async () => {
    const save = vi.fn();
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'S' })), save });
    await store.load('r1');
    putBackup({ title: 'Other tab, offline' }, 1);
    expect(await TestBed.inject(PendingSaves).flushAll()).toBe(true);
    expect(stored()?.input.title).toBe('Other tab, offline');
    expect(save).not.toHaveBeenCalled();
  });

  it('a destroyed editor whose leaving flush could not save makes flushAll not clean', async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    const pending = TestBed.inject(PendingSaves);
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Unsent' }));
    TestBed.resetTestingModule();
    expect(await pending.flushAll()).toBe(false);
  });

  it("never applies another user's backup", async () => {
    putBackup({ title: 'Not yours' }, 3, 'u2');
    const save = vi.fn();
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'Server', version: 3 })), save });
    await store.load('r1');
    expect(store.recipe().title).toBe('Server');
    expect(store.restored()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
    expect(stored()?.userId).toBe('u2'); // left for its owner
  });

  it('with localStorage throwing, the editor still loads and saves', async () => {
    for (const m of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    }
    const save = vi.fn().mockResolvedValue(serverRecipe({ title: 'Works', version: 2 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Works' }));
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'Works' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
  });

  it('an edit during an in-flight save keeps the backup until that edit is saved too', async () => {
    let resolve!: (r: Recipe) => void;
    const save = vi.fn().mockReturnValueOnce(new Promise<Recipe>((r) => (resolve = r)));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'A' }));
    await vi.advanceTimersByTimeAsync(800);
    store.update((r) => ({ ...r, title: 'AB' }));
    save.mockResolvedValue(serverRecipe({ title: 'AB', version: 3 }));
    resolve(serverRecipe({ title: 'A', version: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.recipe().title).toBe('AB');
    expect(stored()).toMatchObject({ input: { title: 'AB' }, baseVersion: 2 });
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status()).toBe('saved');
    expect(stored()).toBeNull();
  });

  it('leaving during an in-flight publish keeps what was typed, re-based on the published version', async () => {
    let resolvePublish!: (r: Recipe) => void;
    const publish = vi.fn().mockReturnValue(new Promise<Recipe>((r) => (resolvePublish = r)));
    const save = vi.fn();
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe({ title: 'T' })), save, publish });
    await store.load('r1');
    const done = store.publish();
    await vi.advanceTimersByTimeAsync(0);
    store.update((r) => ({ ...r, title: 'T!' }));
    TestBed.resetTestingModule(); // leave: the leaving flush returns at once (autosave is held)
    resolvePublish(serverRecipe({ status: 'PUBLISHED', title: 'T', version: 2 }));
    await done;
    expect(stored()).toMatchObject({ input: { title: 'T!' }, baseVersion: 2 }); // next open: applied and saved, not a conflict
  });

  it('leaving with a save failing (e.g. offline at logout) keeps the backup', async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'Keep me' }));
    await TestBed.inject(PendingSaves).flushAll();
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stored()?.input.title).toBe('Keep me');
  });

  it('deleting the recipe deletes its backup', async () => {
    const save = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const store = setupAs({ get: vi.fn().mockResolvedValue(serverRecipe()), save, remove: vi.fn().mockResolvedValue(undefined) });
    await store.load('r1');
    store.update((r) => ({ ...r, title: 'x' }));
    await store.remove();
    expect(stored()).toBeNull();
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
