import { Injectable } from '@angular/core';
import { RecipeInput } from '../recipe.model';

/**
 * What one editor (tab) keeps for a recipe: its working copy, the server version it is based on,
 * when it was written, whose it is, and amount texts that are not valid amounts yet (by "group.row").
 */
export type Backup = {
  input: RecipeInput;
  baseVersion: number;
  savedAt: number;
  userId: string;
  amountTexts?: Record<string, string>;
};

/** A backup as read back: which writer (tab) wrote it. */
export type ReadBackup = Backup & { writerId: string };

const KEY_PREFIX = 'ricettine.unsaved.';
export const backupKey = (recipeId: string) => `${KEY_PREFIX}${recipeId}`;
/** An entry older than this (since its last write) is ignored and deleted. */
export const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entries = Record<string, Backup>;

const valid = (b: unknown): b is Backup => {
  const x = b as Partial<Backup> | null;
  return !!x && typeof x === 'object' && typeof x.userId === 'string' && typeof x.baseVersion === 'number' &&
    !!x.input && typeof x.input === 'object' && typeof x.savedAt === 'number';
};

/**
 * The editor's safety net for text the server has not confirmed yet (tab closed, phone locked,
 * offline, session expired, logout, conflict): a synchronous localStorage copy, written on every
 * change and deleted once a save that includes the newest change succeeded.
 *
 * One key per recipe holds one entry per writer (an editor instance, i.e. a tab), so two tabs on the
 * same recipe never overwrite or delete each other's text: `write` and `clear` touch only their own
 * entry, `read` gives the newest entry of this user. Entries are tagged with the user id, so one
 * person's backup is never applied for another on a shared browser; each expires 7 days after its
 * last write.
 *
 * Storage may be missing, full or blocked: every access is wrapped, and then the editor simply works
 * without a backup.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedBackup {
  /** The newest entry of this user for the recipe (others' and older entries stay); expired entries are deleted. */
  read(recipeId: string, userId: string): ReadBackup | null {
    try {
      const entries = this.entries(recipeId);
      const now = Date.now();
      let expired = false;
      let best: ReadBackup | null = null;
      for (const [writerId, b] of Object.entries(entries)) {
        if (!valid(b)) continue;
        if (now - b.savedAt > BACKUP_TTL_MS) {
          delete entries[writerId];
          expired = true;
          continue;
        }
        if (b.userId === userId && (!best || b.savedAt >= best.savedAt)) best = { writerId, ...b };
      }
      if (expired) this.store(recipeId, entries);
      return best;
    } catch {
      return null;
    }
  }

  /**
   * Replaces this writer's entry. Returns false if storage refused it (e.g. quota); then this writer's
   * older entry is removed too, so an outdated copy is never left looking current.
   */
  write(recipeId: string, writerId: string, userId: string, input: RecipeInput, amountTexts?: Record<string, string>): boolean {
    const b: Backup = { input, baseVersion: input.version, savedAt: Date.now(), userId };
    if (amountTexts && Object.keys(amountTexts).length) b.amountTexts = amountTexts;
    try {
      this.store(recipeId, { ...this.entries(recipeId), [writerId]: b });
      return true;
    } catch {
      this.clear(recipeId, writerId);
      return false;
    }
  }

  /** Deletes this writer's entry of the recipe (other tabs' and users' entries are left alone). */
  clear(recipeId: string, writerId: string): void {
    try {
      const entries = this.entries(recipeId);
      if (!(writerId in entries)) return;
      delete entries[writerId];
      this.store(recipeId, entries);
    } catch {
      // storage unavailable
    }
  }

  /**
   * Deletes every expired or malformed entry of every recipe (also those never reopened: other users'
   * on a shared browser, deleted recipes) and keys left empty. Fresh entries and non-backup keys stay.
   * Run at app start and after logout.
   */
  sweep(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) keys.push(k);
      }
      const now = Date.now();
      for (const key of keys) {
        try {
          const id = key.slice(KEY_PREFIX.length);
          const entries = this.entries(id);
          const kept: Entries = {};
          for (const [w, b] of Object.entries(entries)) {
            if (valid(b) && now - b.savedAt <= BACKUP_TTL_MS) kept[w] = b;
          }
          if (Object.keys(kept).length !== Object.keys(entries).length || !localStorage.getItem(key)?.startsWith('{')) {
            this.store(id, kept);
          }
        } catch {
          // this key is unreadable or locked: leave it
        }
      }
    } catch {
      // storage unavailable
    }
  }

  /** The stored entries (unreadable or malformed value: none). Throws if storage is unavailable. */
  private entries(recipeId: string): Entries {
    const raw = localStorage.getItem(backupKey(recipeId));
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Entries) : {};
    } catch {
      return {};
    }
  }

  private store(recipeId: string, entries: Entries): void {
    if (Object.keys(entries).length) localStorage.setItem(backupKey(recipeId), JSON.stringify(entries));
    else localStorage.removeItem(backupKey(recipeId));
  }
}
