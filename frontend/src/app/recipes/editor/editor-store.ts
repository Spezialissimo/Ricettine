import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { errorKey, toApiError } from '../../core/api-error';
import { PendingSaves } from '../../core/pending-saves';
import { RecipeApi } from '../recipe.api';
import { Photo, Recipe, RecipeInput, toInput } from '../recipe.model';
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

/** Where a photo goes: the cover, or the step at this index. */
export type PhotoSlot = 'cover' | number;

/** An upload (or a refused pick) shown in its slot. `preview` is an object URL, revoked once the server thumb loaded. */
export type PhotoUpload = {
  id: number;
  slot: PhotoSlot;
  status: 'uploading' | 'done' | 'failed';
  preview: string | null;
  error: string | null;
};

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
  private readonly _uploads = signal<PhotoUpload[]>([]);
  private readonly _photos = signal<Record<string, Photo>>({});
  private readonly _photoGone = signal(false);
  private nextUploadId = 1;
  private _id: string | null = null;

  readonly autosave = new Autosave({
    save: (input) => this.saveDroppingGonePhotos(input),
    read: () => withoutBlankIngredients(this._recipe()),
    saved: (r) => {
      this._server.set(r);
      this._recipe.update((cur) => ({ ...cur, version: r.version }));
    },
  });

  readonly recipe: Signal<RecipeInput> = this._recipe.asReadonly();
  /** Uploads and refused picks per slot (see `uploadFor`). */
  readonly uploads: Signal<PhotoUpload[]> = this._uploads.asReadonly();
  /** True while any photo is still being uploaded (Publish waits). */
  readonly uploading = computed(() => this._uploads().some((u) => u.status === 'uploading'));
  /** True after a save found that an uploaded photo had been cleaned up and dropped its reference. */
  readonly photoGone: Signal<boolean> = this._photoGone.asReadonly();
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
    // Logging out sends what was typed first (PendingSaves.flushAll), while the session is valid.
    const pending = inject(PendingSaves);
    const unregister = pending.register(() => this.autosave.flush());
    // Leaving the page (nav link, back) still sends what was typed; then stop for good.
    inject(DestroyRef).onDestroy(() => {
      unregister();
      this._uploads().forEach((u) => this.revoke(u.preview));
      this._uploads.set([]);
      pending.track(this.autosave.flush().finally(() => this.autosave.dispose()));
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

  // ---- photos ----

  uploadFor(slot: PhotoSlot): PhotoUpload | undefined {
    return this._uploads().find((u) => u.slot === slot);
  }

  /** The photo (thumb and display URLs) behind a media id: uploaded this session, or on the server copy. */
  photoOf(mediaId: string | null | undefined): Photo | null {
    if (!mediaId) return null;
    const fresh = this._photos()[mediaId];
    if (fresh) return fresh;
    const s = this._server();
    if (!s) return null;
    return [s.cover, ...s.steps.map((st) => st.photo)].find((p) => p?.mediaId === mediaId) ?? null;
  }

  /** Uploads `file` into `slot`: shows a local preview at once, then saves the reference through `update`. */
  async uploadPhoto(slot: PhotoSlot, file: File): Promise<void> {
    if (!this._id) return;
    this._photoGone.set(false);
    const id = this.nextUploadId++;
    const preview = URL.createObjectURL(file);
    this.setUpload({ id, slot, status: 'uploading', preview, error: null });
    try {
      const photo = await this.api.uploadPhoto(this._id, file);
      const mine = this._uploads().find((u) => u.id === id);
      if (!mine) return; // replaced, removed or its step deleted meanwhile; setUpload/dropUpload revoked the preview
      this._photos.update((m) => ({ ...m, [photo.mediaId]: photo }));
      this.setReference(mine.slot, photo.mediaId);
      this._uploads.update((us) => us.map((u) => (u.id === id ? { ...u, status: 'done' } : u)));
    } catch (e) {
      const mine = this._uploads().find((u) => u.id === id);
      if (!mine) return;
      this.revoke(preview);
      this._uploads.update((us) => us.map((u) => (u.id === id ? { ...u, status: 'failed', preview: null, error: errorKey(toApiError(e)) } : u)));
    }
  }

  /** A file the client refused (too large, not an image): the slot shows the message. */
  rejectPhoto(slot: PhotoSlot, key: string): void {
    this.setUpload({ id: this.nextUploadId++, slot, status: 'failed', preview: null, error: key });
  }

  removePhoto(slot: PhotoSlot): void {
    this.dropUpload(slot);
    this.setReference(slot, null);
  }

  /** The server thumb is on screen: the local preview is no longer needed. */
  previewLoaded(slot: PhotoSlot): void {
    const u = this.uploadFor(slot);
    if (u?.status === 'done') this.dropUpload(slot);
  }

  /** Steps below an inserted/removed step move: their uploads follow (the removed step's upload is discarded). */
  stepInserted(at: number): void {
    this._uploads.update((us) => us.map((u) => (typeof u.slot === 'number' && u.slot >= at ? { ...u, slot: u.slot + 1 } : u)));
  }

  stepRemoved(at: number): void {
    this.dropUpload(at);
    this._uploads.update((us) => us.map((u) => (typeof u.slot === 'number' && u.slot > at ? { ...u, slot: u.slot - 1 } : u)));
  }

  private setReference(slot: PhotoSlot, mediaId: string | null): void {
    this.update((r) =>
      slot === 'cover'
        ? { ...r, coverMediaId: mediaId }
        : slot < r.steps.length
          ? { ...r, steps: r.steps.map((s, i) => (i === slot ? { ...s, photoMediaId: mediaId } : s)) }
          : r,
    );
  }

  private setUpload(u: PhotoUpload): void {
    this._uploads().filter((x) => x.slot === u.slot).forEach((x) => this.revoke(x.preview));
    this._uploads.update((us) => [...us.filter((x) => x.slot !== u.slot), u]);
  }

  private dropUpload(slot: PhotoSlot): void {
    this._uploads().filter((x) => x.slot === slot).forEach((x) => this.revoke(x.preview));
    this._uploads.update((us) => us.filter((x) => x.slot !== slot));
  }

  private revoke(url: string | null): void {
    if (url) URL.revokeObjectURL(url);
  }

  /**
   * An upload that nothing referenced for 24 h is orphan-cleaned; saving its reference then gives 400
   * `photo_not_in_recipe`. Drop the references the server never confirmed, tell the person, and save again.
   */
  private async saveDroppingGonePhotos(input: RecipeInput): Promise<Recipe> {
    try {
      return await this.api.save(this._id!, input);
    } catch (e) {
      if (toApiError(e).code !== 'photo_not_in_recipe') throw e;
      const known = new Set(
        [this._server()?.cover, ...(this._server()?.steps.map((s) => s.photo) ?? [])].flatMap((p) => (p ? [p.mediaId] : [])),
      );
      const keep = (id: string | null) => (id !== null && known.has(id) ? id : null);
      const strip = (r: RecipeInput): RecipeInput => ({
        ...r,
        coverMediaId: keep(r.coverMediaId),
        steps: r.steps.map((s) => ({ ...s, photoMediaId: keep(s.photoMediaId) })),
      });
      const fixed = strip(input);
      if (JSON.stringify(fixed) === JSON.stringify(input)) throw e; // nothing to drop: a real error
      this._recipe.update(strip);
      this._photoGone.set(true);
      return this.api.save(this._id!, fixed);
    }
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
   * 'blocked'). On 'published' the store adopts the returned recipe, or, if something was typed while
   * the request was in flight, only its metadata (status, version, ...) and then saves those edits. A 409 moves the store into
   * `conflict` ('conflict'); other server refusals (recipe_incomplete, ...) are thrown.
   */
  async publish(): Promise<'published' | 'invalid' | 'blocked' | 'conflict'> {
    if (!this._id) return 'blocked';
    if (this.hasUnsavedInput()) return 'invalid';
    await this.autosave.flush();
    const st = this.status();
    if (st === 'error' || st === 'conflict' || st === 'offline' || this.autosave.dirty()) return 'blocked';
    // The editor stays editable while publishing: hold autosave so nothing goes out with the
    // pre-publish version (a false 409), and keep whatever is typed meanwhile.
    this.autosave.suspend();
    let published: Recipe;
    try {
      published = await this.api.publish(this._id, this._recipe().version);
    } catch (e) {
      this.autosave.resume();
      const err = toApiError(e);
      if (err.status === 409 || err.code === 'recipe_conflict') {
        this.autosave.markConflict(err);
        return 'conflict';
      }
      throw e;
    }
    if (this.autosave.dirty()) {
      // Edits typed during the request: adopt only the server metadata, then save them at the new version.
      this._server.set(published);
      this._recipe.update((cur) => ({ ...cur, version: published.version }));
    } else {
      this.replace(published);
    }
    this.autosave.resume();
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
