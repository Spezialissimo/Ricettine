import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ApiError, errorKey, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { PendingSaves } from '../../core/pending-saves';
import { RecipeApi } from '../recipe.api';
import { Photo, Recipe, RecipeInput, toInput } from '../recipe.model';
import { Autosave, SaveStatus } from './autosave';
import { unnamedRows } from './completeness';
import { remapIndex } from './remap-index';
import { ReadBackup, UnsavedBackup } from './unsaved-backup';

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

/** Ingredient rows holding nothing at all (no name, amount, unit or note) carry no typed text. */
const withoutEmptyRows = (r: RecipeInput): RecipeInput => ({
  ...r,
  groups: r.groups.map((g) => ({
    ...g,
    ingredients: g.ingredients.filter((i) => !(blank(i.name) && i.amount === null && i.unit === null && blank(i.note))),
  })),
});

/**
 * Same recipe content, whatever the version and key order (a backup the server already has). Compares
 * the raw working copy: a nameless row holding an amount, unit or note is typed text the server never got.
 */
function sameContent(a: RecipeInput, b: RecipeInput): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
  const strip = (r: RecipeInput) => JSON.stringify(canon({ ...withoutEmptyRows(r), version: 0 }));
  return strip(a) === strip(b);
}

const sameTexts = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/** Identifies one editor instance (one tab) among the writers of a recipe's backup. */
const newWriterId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** An upload failure worth retrying with the same file (no connection, server error, 503 busy). */
const retryableUpload = (e: ApiError) => e.status === 0 || e.status >= 500;

/** Where a photo goes: the cover, or the step at this index. */
export type PhotoSlot = 'cover' | number;

/**
 * An upload (or a refused pick) shown in its slot. `preview` is an object URL, revoked once the server
 * thumb loaded. A failed upload that can be retried keeps its `file` and preview ("Upload failed — Retry").
 */
export type PhotoUpload = {
  id: number;
  slot: PhotoSlot;
  status: 'uploading' | 'done' | 'failed';
  preview: string | null;
  error: string | null;
  file?: File | null;
};

/**
 * Working copy of one recipe in the editor. Provided per editor page (not root).
 * Every `update()` autosaves; the server copy (`server`) is refreshed by each successful save.
 */
@Injectable()
export class EditorStore {
  private readonly api = inject(RecipeApi);
  private readonly backup = inject(UnsavedBackup);
  private readonly auth = inject(AuthStore);
  /** Whose editor this is (captured at load): the backup is written and read for this user only. */
  private userId: string | null = null;
  /** This editor's (tab's) entry in the recipe's backup: it writes and clears only its own. */
  private readonly writerId = newWriterId();
  /** Whether this editor's last backup write was stored (storage may be full or blocked). */
  private lastWriteOk = false;
  private readonly _restored = signal(false);
  /** True once a save after the restore succeeded (the restored text is on the server). */
  private readonly _restoreSaved = signal(false);
  /** Amount texts from the restored backup (by "group.row"), handed to the ingredients editor. */
  private readonly _restoredTexts = signal<Record<string, string>>({});
  private readonly _recipe = signal<RecipeInput>(EMPTY);
  private readonly _server = signal<Recipe | null>(null);
  private readonly _loadError = signal<string | null>(null);
  private readonly _invalidTexts = signal<Record<string, string>>({});
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
      this._restoreSaved.set(true);
    },
    // Input that is never sent (nameless rows with data, invalid amounts) stays backed up after a save.
    backup: { write: () => this.writeBackup(), clear: () => (this.hasUnsavedInput() ? this.writeBackup() : this.clearBackup()) },
  });

  readonly recipe: Signal<RecipeInput> = this._recipe.asReadonly();
  /** Uploads and refused picks per slot (see `uploadFor`). */
  readonly uploads: Signal<PhotoUpload[]> = this._uploads.asReadonly();
  /** True while any photo is still being uploaded (Publish waits). */
  readonly uploading = computed(() => this._uploads().some((u) => u.status === 'uploading'));
  /** True while a photo is uploading or failed and can be retried: Publish waits, leaving asks first. */
  readonly uploadsUnfinished = computed(() => this._uploads().some((u) => u.status === 'uploading' || (u.status === 'failed' && !!u.file)));
  /** True when this visit started from text saved locally on an earlier visit (applied and saved, or being saved). */
  readonly restored: Signal<boolean> = this._restored.asReadonly();
  /** Amount texts restored from the local backup (by "group.row"); replaced by each server copy. */
  readonly restoredAmountTexts: Signal<Record<string, string>> = this._restoredTexts.asReadonly();
  /** True after a save found that an uploaded photo had been cleaned up and dropped its reference. */
  readonly photoGone: Signal<boolean> = this._photoGone.asReadonly();
  readonly status: Signal<SaveStatus> = this.autosave.status;
  /** Last server copy (id, status, share link, photo URLs), refreshed by load and every save. */
  readonly server: Signal<Recipe | null> = this._server.asReadonly();
  /** Amount fields holding text that is not a valid amount, by "group.row" (reported by the ingredients editor). */
  readonly invalidAmountTexts: Signal<Record<string, string>> = this._invalidTexts.asReadonly();
  /** Number of ingredient amount fields currently holding text that is not a valid amount. */
  readonly invalidAmounts = computed(() => Object.keys(this._invalidTexts()).length);
  /** Bumped whenever a server copy replaces the working copy (load, load latest, publish): editors drop local text. */
  readonly epoch: Signal<number> = this._epoch.asReadonly();
  /** Nameless ingredient rows holding an amount, unit or note: never saved, so an unsaved state to the person. */
  readonly unnamedIngredients = computed(() => unnamedRows(this._recipe().groups).length);
  /** True while typed input exists that cannot be saved (invalid amounts, nameless rows with data). */
  readonly hasUnsavedInput = computed(() => this.invalidAmounts() > 0 || this.unnamedIngredients() > 0);
  readonly loaded = computed(() => this._server() !== null);
  /** i18n key of the load failure, if any. */
  readonly loadError: Signal<string | null> = this._loadError.asReadonly();
  /** i18n key of the last save failure (null when fine). */
  readonly saveError = computed(() => {
    const e = this.autosave.error();
    return e && this.status() !== 'conflict' ? errorKey(e) : null;
  });
  /**
   * The server refused (4xx, not a conflict) the save of text restored from the local backup before it
   * was ever saved: the page offers "Use saved version" (Load latest), which discards this backup.
   */
  readonly restoreRefused = computed(() => {
    const e = this.autosave.error();
    return this._restored() && !this._restoreSaved() && this.status() === 'error' &&
      !!e && e.status >= 400 && e.status < 500 && e.status !== 401;
  });
  /** Server-reported field problems by dotted path (`title`, `steps[3].text`, ...). */
  readonly fieldErrors = computed<Record<string, string>>(() => {
    const e = this.autosave.error();
    return e?.fields && this.status() !== 'conflict' ? e.fields : {};
  });

  constructor() {
    // Logging out sends what was typed first (PendingSaves.flushAll), while the session is valid.
    // Rejects when text stayed unsaved, so a logout keeps the local backups.
    const pending = inject(PendingSaves);
    const unregister = pending.register(() => this.autosave.flush().then(() => this.savedForLogout()));
    // Leaving the page (nav link, back) still sends what was typed; then stop for good.
    inject(DestroyRef).onDestroy(() => {
      unregister();
      this._uploads().forEach((u) => this.revoke(u.preview));
      this._uploads.set([]);
      pending.track(this.autosave.flush().finally(() => this.autosave.dispose()).then(() => this.savedForLogout()));
    });
  }

  /**
   * After a flush: rejects if text stayed unsaved, re-writing this editor's backup entry first (it is
   * all that will be left of the text); otherwise deletes this editor's entry (never another tab's).
   */
  private savedForLogout(): void {
    if (this.autosave.dirty() || this.hasUnsavedInput()) {
      this.writeBackup();
      throw new Error('unsaved recipe text');
    }
    this.clearBackup();
  }

  id(): string | null {
    return this._id;
  }

  async load(id: string): Promise<void> {
    this._id = id;
    this.userId = this.auth.me()?.id ?? null;
    this._loadError.set(null);
    let server: Recipe;
    try {
      server = await this.api.get(id);
    } catch (e) {
      this._loadError.set(errorKey(toApiError(e)));
      return;
    }
    this.replace(server);
    const b = this.userId ? this.backup.read(id, this.userId) : null;
    if (b) this.restore(server, b);
  }

  /**
   * Text kept locally from an earlier visit that the server never confirmed. Based on the server's
   * current version: apply it and save. Based on an older one (changed elsewhere meanwhile): the
   * conflict banner, with the backup's text in the editor and its copyable block. Already on the
   * server: just drop it.
   */
  private restore(server: Recipe, b: ReadBackup): void {
    const texts = Object.fromEntries(
      Object.entries(b.amountTexts ?? {}).filter(([k, v]) => {
        const [g, i] = k.split('.').map(Number);
        return typeof v === 'string' && !!b.input.groups?.[g]?.ingredients?.[i];
      }),
    );
    if (!Object.keys(texts).length && sameContent(b.input, toInput(server))) {
      this.backup.clear(this._id!, b.writerId);
      return;
    }
    this._epoch.update((n) => n + 1);
    this._restoredTexts.set(texts);
    this._invalidTexts.set(texts);
    if (b.baseVersion === server.version) {
      this._recipe.set({ ...b.input, version: server.version });
      this._restored.set(true);
      this._restoreSaved.set(false);
      this.autosave.changed();
      void this.autosave.flush();
    } else {
      this._recipe.set(b.input);
      this.autosave.markConflict({ status: 409, code: 'recipe_conflict' });
      this.autosave.changed(); // unsaved: Done stays, the backup stays
    }
    // This editor took the text over (its own entry now holds it): the entry it came from goes, so a
    // later save or "Load latest" here doesn't leave it behind to be restored again. Kept if our write failed.
    if (b.writerId !== this.writerId && this.lastWriteOk) this.backup.clear(this._id!, b.writerId);
  }

  private writeBackup(): void {
    if (!this._id || !this.userId) return;
    this.lastWriteOk = this.backup.write(this._id, this.writerId, this.userId, this._recipe(), this._invalidTexts());
  }

  private clearBackup(): void {
    if (!this._id || !this.userId) return;
    this.backup.clear(this._id, this.writerId);
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
      this._uploads.update((us) => us.map((u) => (u.id === id ? { ...u, status: 'done', file: null } : u)));
    } catch (e) {
      const mine = this._uploads().find((u) => u.id === id);
      if (!mine) return;
      const err = toApiError(e);
      if (retryableUpload(err)) {
        // never dropped silently: the preview stays with "Upload failed — Retry"
        this._uploads.update((us) => us.map((u) => (u.id === id ? { ...u, status: 'failed', file, error: 'editor.uploadFailed' } : u)));
        return;
      }
      this.revoke(preview);
      this._uploads.update((us) => us.map((u) => (u.id === id ? { ...u, status: 'failed', preview: null, error: errorKey(err) } : u)));
    }
  }

  /** Sends the file of a failed upload again (same slot, same file). */
  retryUpload(slot: PhotoSlot): Promise<void> {
    const u = this.uploadFor(slot);
    return u?.status === 'failed' && u.file ? this.uploadPhoto(u.slot, u.file) : Promise.resolve();
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

  /** A step moved from `from` to `to`: the uploads of every step in between follow it (the moved step's goes with it). */
  stepMoved(from: number, to: number): void {
    this._uploads.update((us) =>
      us.map((u) => (typeof u.slot === 'number' ? { ...u, slot: remapIndex(u.slot, from, to) } : u)),
    );
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
   * `photo_not_in_recipe` naming exactly those ids. Drop only them, tell the person, and save again.
   * Without the ids nothing is dropped and the error shows.
   */
  private async saveDroppingGonePhotos(input: RecipeInput): Promise<Recipe> {
    try {
      return await this.api.save(this._id!, input);
    } catch (e) {
      const err = toApiError(e);
      if (err.code !== 'photo_not_in_recipe' || !err.mediaIds?.length) throw e;
      const gone = new Set(err.mediaIds);
      const keep = (id: string | null) => (id !== null && gone.has(id) ? null : id);
      const strip = (r: RecipeInput): RecipeInput => ({
        ...r,
        coverMediaId: keep(r.coverMediaId),
        steps: r.steps.map((s) => ({ ...s, photoMediaId: keep(s.photoMediaId) })),
      });
      const fixed = strip(input);
      if (JSON.stringify(fixed) === JSON.stringify(input)) throw e;
      this._recipe.update(strip);
      this._photoGone.set(true);
      return this.api.save(this._id!, fixed);
    }
  }

  /** The ingredients editor reports the amount texts that are not valid amounts; they are kept in the local backup. */
  setInvalidAmounts(texts: Record<string, string>): void {
    if (sameTexts(texts, this._invalidTexts())) return;
    this._invalidTexts.set({ ...texts });
    if (!this.loaded()) return;
    if (this.autosave.dirty() || this.hasUnsavedInput()) this.writeBackup();
    else this.clearBackup();
  }

  flush(): Promise<void> {
    return this.autosave.flush();
  }

  /** "Load latest" after a conflict: the server copy replaces the working copy. */
  async loadLatest(): Promise<void> {
    if (!this._id) return;
    await this.autosave.settled();
    this.replace(await this.api.get(this._id));
    this.clearBackup(); // the person chose the server copy (the banner showed their text to copy)
  }

  /** Replaces the working copy with a server copy (load, load latest, publish). */
  replace(r: Recipe): void {
    this._server.set(r);
    this._recipe.set(toInput(r));
    this._restored.set(false);
    this._restoredTexts.set({});
    this._invalidTexts.set({}); // the ingredients editor drops its typed texts on the epoch bump
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
    if (!this._id || this.uploadsUnfinished()) return 'blocked';
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
      this.adoptMetadata(published);
    } else {
      this.replace(published);
    }
    this.autosave.resume();
    return 'published';
  }

  /** Takes the server's metadata (status, version, share URL, ...) but keeps the working copy as typed. */
  private adoptMetadata(r: Recipe): void {
    this._server.set(r);
    this._recipe.update((cur) => ({ ...cur, version: r.version }));
    // text typed meanwhile is now based on this version (also if the page was left during the request)
    if (this.autosave.dirty() || this.hasUnsavedInput()) this.writeBackup();
  }

  /**
   * Replaces the share link. Reset bumps the version, so the returned version and URL are adopted
   * while whatever is typed stays (autosave is held during the request, then saves at the new version).
   */
  async resetLink(): Promise<void> {
    if (!this._id) return;
    this.autosave.suspend();
    try {
      await this.autosave.settled();
      this.adoptMetadata(await this.api.resetLink(this._id));
    } finally {
      this.autosave.resume();
    }
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
    this.clearBackup();
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
    this.clearBackup();
  }
}
