import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { errorKey, toApiError } from '../../core/api-error';
import { RecipeApi } from '../recipe.api';
import { Recipe, RecipeInput, toInput } from '../recipe.model';
import { Autosave, SaveStatus } from './autosave';
import { unnamedRows } from './completeness';

const EMPTY: RecipeInput = {
  version: 0, title: '', portions: 1, prepMinutes: null, cookMinutes: null, source: null, notes: null,
  visibility: 'PRIVATE', coverMediaId: null, groups: [], steps: [],
};

const blank = (s: string | null) => !s || !s.trim();

/** A draft nobody has typed anything into (Done deletes it instead of keeping an empty recipe). */
export function isUntouchedDraft(server: Recipe | null, r: RecipeInput): boolean {
  return (
    server?.status === 'DRAFT' &&
    blank(r.title) && blank(r.source) && blank(r.notes) &&
    r.portions === 1 && r.prepMinutes === null && r.cookMinutes === null &&
    r.visibility === 'PRIVATE' && r.coverMediaId === null &&
    r.groups.length === 0 && r.steps.length === 0
  );
}

/**
 * What is sent to the server: ingredient rows without a name are held back (the server rejects them,
 * and a row being typed must not show "Not saved"). They stay in the working copy.
 */
export function withoutBlankIngredients(r: RecipeInput): RecipeInput {
  return { ...r, groups: r.groups.map((g) => ({ ...g, ingredients: g.ingredients.filter((i) => !blank(i.name)) })) };
}

/** The user's own words, for the copyable block shown on a conflict: title, notes, then steps. */
export function conflictText(r: RecipeInput): string {
  return [r.title, r.notes, ...r.steps.map((s) => s.text)]
    .filter((t): t is string => !blank(t))
    .join('\n\n');
}

/**
 * Working copy of one recipe in the editor. Provided per editor page (not root).
 * Every `update()` autosaves; the server copy (`server`) is refreshed by each successful save.
 */
@Injectable()
export class EditorStore {
  private readonly api = inject(RecipeApi);
  private readonly _recipe = signal<RecipeInput>(EMPTY);
  private readonly _server = signal<Recipe | null>(null);
  private readonly _loadError = signal<string | null>(null);
  private readonly _invalidAmounts = signal(0);
  private readonly _epoch = signal(0);
  private _id: string | null = null;

  readonly autosave = new Autosave({
    save: (input) => this.api.save(this._id!, input),
    read: () => withoutBlankIngredients(this._recipe()),
    saved: (r) => {
      this._server.set(r);
      this._recipe.update((cur) => ({ ...cur, version: r.version }));
    },
  });

  readonly recipe: Signal<RecipeInput> = this._recipe.asReadonly();
  readonly status: Signal<SaveStatus> = this.autosave.status;
  /** Last server copy (id, status, share link, photo URLs), refreshed by load and every save. */
  readonly server: Signal<Recipe | null> = this._server.asReadonly();
  /** Number of ingredient amount fields currently holding text that is not a valid amount (reported by the ingredients editor). */
  readonly invalidAmounts: Signal<number> = this._invalidAmounts.asReadonly();
  /** Bumped whenever a server copy replaces the working copy (load, load latest, publish): editors drop local text. */
  readonly epoch: Signal<number> = this._epoch.asReadonly();
  /** Nameless ingredient rows holding an amount, unit or note: never saved, so an unsaved state to the person. */
  readonly unnamedIngredients = computed(() => unnamedRows(this._recipe().groups).length);
  /** True while typed input exists that cannot be saved (invalid amounts, nameless rows with data). */
  readonly hasUnsavedInput = computed(() => this._invalidAmounts() > 0 || this.unnamedIngredients() > 0);
  readonly loaded = computed(() => this._server() !== null);
  /** i18n key of the load failure, if any. */
  readonly loadError: Signal<string | null> = this._loadError.asReadonly();
  /** i18n key of the last save failure (null when fine). */
  readonly saveError = computed(() => {
    const e = this.autosave.error();
    return e && this.status() !== 'conflict' ? errorKey(e) : null;
  });
  /** Server-reported field problems by dotted path (`title`, `steps[3].text`, ...). */
  readonly fieldErrors = computed<Record<string, string>>(() => {
    const e = this.autosave.error();
    return e?.fields && this.status() !== 'conflict' ? e.fields : {};
  });

  constructor() {
    // Leaving the page (nav link, back) still sends what was typed; then stop for good.
    inject(DestroyRef).onDestroy(() => {
      void this.autosave.flush().finally(() => this.autosave.dispose());
    });
  }

  id(): string | null {
    return this._id;
  }

  async load(id: string): Promise<void> {
    this._id = id;
    this._loadError.set(null);
    try {
      this.replace(await this.api.get(id));
    } catch (e) {
      this._loadError.set(errorKey(toApiError(e)));
    }
  }

  /** Applies a change to the working copy and schedules an autosave. Ignored before load. */
  update(fn: (r: RecipeInput) => RecipeInput): void {
    if (!this.loaded()) return;
    this._recipe.set(fn(this._recipe()));
    this.autosave.changed();
  }

  setInvalidAmounts(n: number): void {
    this._invalidAmounts.set(n);
  }

  flush(): Promise<void> {
    return this.autosave.flush();
  }

  /** "Load latest" after a conflict: the server copy replaces the working copy. */
  async loadLatest(): Promise<void> {
    if (!this._id) return;
    await this.autosave.settled();
    this.replace(await this.api.get(this._id));
  }

  /** Replaces the working copy with a server copy (load, load latest, publish). */
  replace(r: Recipe): void {
    this._server.set(r);
    this._recipe.set(toInput(r));
    this.autosave.reset();
    this._epoch.update((n) => n + 1);
  }

  /**
   * Publishes: refuses while input cannot be saved ('invalid': an invalid amount or a nameless ingredient row with data); otherwise saves pending
   * changes first and publishes only if that left nothing wrong (no error, conflict or offline:
   * 'blocked'). On 'published' the store adopts the returned recipe. A 409 moves the store into
   * `conflict` ('conflict'); other server refusals (recipe_incomplete, ...) are thrown.
   */
  async publish(): Promise<'published' | 'invalid' | 'blocked' | 'conflict'> {
    if (!this._id) return 'blocked';
    if (this.hasUnsavedInput()) return 'invalid';
    await this.autosave.flush();
    const st = this.status();
    if (st === 'error' || st === 'conflict' || st === 'offline' || this.autosave.dirty()) return 'blocked';
    try {
      this.replace(await this.api.publish(this._id, this._recipe().version));
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 409 || err.code === 'recipe_conflict') {
        this.autosave.markConflict(err);
        return 'conflict';
      }
      throw e;
    }
    return 'published';
  }

  isUntouchedDraft(): boolean {
    return isUntouchedDraft(this._server(), this._recipe());
  }

  /**
   * Done on an untouched draft: deletes it only if it is still empty on the server too, at the version
   * this editor last loaded or saved. DELETE carries no version, so this re-check is what keeps Done
   * from deleting content saved meanwhile on another device. Never deletes during a conflict.
   * Resolves true if the recipe was deleted.
   */
  async removeIfUntouched(): Promise<boolean> {
    if (this.status() === 'conflict' || !this.isUntouchedDraft()) return false;
    this.autosave.suspend();
    try {
      await this.autosave.settled();
      const known = this._recipe().version;
      const fresh = await this.api.get(this._id!);
      const stillEmpty =
        this.status() !== 'conflict' && fresh.version === known && isUntouchedDraft(fresh, toInput(fresh));
      if (!stillEmpty || !this.isUntouchedDraft()) {
        this.autosave.resume();
        return false;
      }
      await this.api.remove(this._id!);
    } catch (e) {
      this.autosave.resume();
      throw e;
    }
    this.autosave.dispose();
    return true;
  }

  /** Stops autosave (nothing more is sent) and deletes the recipe. */
  async remove(): Promise<void> {
    this.autosave.suspend();
    try {
      await this.autosave.settled();
      await this.api.remove(this._id!);
    } catch (e) {
      this.autosave.resume(); // still here: keep saving what the user types
      throw e;
    }
    this.autosave.dispose();
  }
}
