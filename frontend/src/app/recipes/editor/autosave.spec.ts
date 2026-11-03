import { HttpErrorResponse } from '@angular/common/http';
import { Recipe, RecipeInput } from '../recipe.model';
import { Autosave } from './autosave';

const input = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  version: 1, title: '', portions: 1, prepMinutes: null, cookMinutes: null, source: null, notes: null,
  visibility: 'PRIVATE', coverMediaId: null, groups: [], steps: [], ...over,
});

const httpError = (status: number, body: unknown = null) =>
  new HttpErrorResponse({ status, error: body, url: '/api/recipes/x' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** A tiny fake "store": the working copy autosave reads from, and the version bump it applies. */
function harness(save: (i: RecipeInput) => Promise<Recipe>) {
  const state = { current: input() };
  const saveFn = vi.fn(save);
  const autosave = new Autosave({
    save: saveFn,
    read: () => state.current,
    saved: (r) => (state.current = { ...state.current, version: r.version }),
  });
  const edit = (over: Partial<RecipeInput>) => {
    state.current = { ...state.current, ...over };
    autosave.changed();
  };
  return { state, saveFn, autosave, edit };
}

const ok = (version: number) => ({ version }) as Recipe;
let nextVersion = 2;
const okSave = async () => ok(nextVersion++);

describe('Autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nextVersion = 2;
  });
  afterEach(() => vi.useRealTimers());

  it('debounces: 3 edits within 500 ms produce one save 800 ms after the last edit', async () => {
    const h = harness(okSave);
    h.edit({ title: 'a' });
    await vi.advanceTimersByTimeAsync(250);
    h.edit({ title: 'ab' });
    await vi.advanceTimersByTimeAsync(250);
    h.edit({ title: 'abc' });
    await vi.advanceTimersByTimeAsync(799);
    expect(h.saveFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.saveFn).toHaveBeenCalledTimes(1);
    expect(h.saveFn.mock.calls[0][0].title).toBe('abc');
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveFn).toHaveBeenCalledTimes(1);
    expect(h.autosave.status()).toBe('saved');
  });

  it('saves at least every 5 s while edits keep coming every 300 ms', async () => {
    const h = harness(okSave);
    const saveTimes: number[] = [];
    h.saveFn.mockImplementation(async () => {
      saveTimes.push(Date.now());
      return ok(nextVersion++);
    });
    const start = Date.now();
    for (let t = 0; t < 6000; t += 300) {
      h.edit({ title: `t${t}` });
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(saveTimes.length).toBeGreaterThanOrEqual(1);
    expect(saveTimes[0] - start).toBeLessThanOrEqual(5000);
    await vi.advanceTimersByTimeAsync(800);
    const gaps = saveTimes.map((t, i) => t - (i === 0 ? start : saveTimes[i - 1]));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(5000);
    expect(h.saveFn.mock.lastCall![0].title).toBe('t5700');
  });

  it('sends an edit made during an in-flight save next, with the version the server returned', async () => {
    const first = deferred<Recipe>();
    const h = harness(() => first.promise);
    h.edit({ title: 'one' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveFn).toHaveBeenCalledTimes(1);
    expect(h.autosave.status()).toBe('saving');

    h.saveFn.mockImplementation(okSave);
    h.edit({ title: 'two' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveFn).toHaveBeenCalledTimes(1); // one request in flight at a time
    expect(h.autosave.status()).toBe('saving'); // "Saved" only once the server confirmed the latest

    first.resolve(ok(7));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.saveFn).toHaveBeenCalledTimes(2);
    expect(h.saveFn.mock.calls[1][0]).toMatchObject({ title: 'two', version: 7 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.autosave.status()).toBe('saved');
  });

  it('stops saving on 409 until reset (Load latest)', async () => {
    const h = harness(async () => {
      throw httpError(409, { code: 'recipe_conflict' });
    });
    h.edit({ title: 'mine' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.autosave.status()).toBe('conflict');
    expect(h.saveFn).toHaveBeenCalledTimes(1);

    h.edit({ title: 'mine, more' });
    await vi.advanceTimersByTimeAsync(10_000);
    await h.autosave.flush();
    expect(h.saveFn).toHaveBeenCalledTimes(1);
    expect(h.state.current.title).toBe('mine, more'); // local text is never thrown away by autosave

    h.saveFn.mockImplementation(okSave);
    h.autosave.reset();
    expect(h.autosave.status()).toBe('idle');
    h.edit({ title: 'after reload' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveFn).toHaveBeenCalledTimes(2);
    expect(h.autosave.status()).toBe('saved');
  });

  it('reports recipe_incomplete as an error with its fields and keeps saving on later edits', async () => {
    const h = harness(async () => {
      throw httpError(400, { code: 'recipe_incomplete', fields: { title: 'required' } });
    });
    h.edit({ title: '' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.autosave.status()).toBe('error');
    expect(h.autosave.error()).toEqual({ status: 400, code: 'recipe_incomplete', fields: { title: 'required' } });
    expect(h.autosave.dirty()).toBe(true);

    h.saveFn.mockImplementation(okSave);
    h.edit({ title: 'Fixed' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveFn).toHaveBeenCalledTimes(2);
    expect(h.autosave.status()).toBe('saved');
    expect(h.autosave.error()).toBeNull();
  });

  it('goes offline on a network error and retries when the browser is back online', async () => {
    const h = harness(async () => {
      throw httpError(0);
    });
    h.edit({ title: 'x' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.autosave.status()).toBe('offline');

    h.saveFn.mockImplementation(okSave);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.saveFn).toHaveBeenCalledTimes(2);
    expect(h.autosave.status()).toBe('saved');
  });

  it('flush saves pending changes right away and waits for the server', async () => {
    const h = harness(okSave);
    h.edit({ title: 'now' });
    await h.autosave.flush();
    expect(h.saveFn).toHaveBeenCalledTimes(1);
    expect(h.autosave.status()).toBe('saved');
    expect(h.autosave.dirty()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.saveFn).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does not call the server', async () => {
    const h = harness(okSave);
    await h.autosave.flush();
    expect(h.saveFn).not.toHaveBeenCalled();
  });

  it('dispose cancels pending saves and stops listening for online', async () => {
    const h = harness(okSave);
    h.edit({ title: 'x' });
    h.autosave.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    window.dispatchEvent(new Event('online'));
    await h.autosave.flush();
    expect(h.saveFn).not.toHaveBeenCalled();
  });
});
