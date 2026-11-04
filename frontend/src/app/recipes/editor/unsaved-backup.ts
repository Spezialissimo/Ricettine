import { Injectable } from '@angular/core';
import { RecipeInput } from '../recipe.model';

/** What is kept per recipe: the working copy, the server version it is based on, when, and whose it is. */
export type Backup = { input: RecipeInput; baseVersion: number; savedAt: number; userId: string };

const PREFIX = 'ricettine.unsaved.';
export const backupKey = (recipeId: string) => `${PREFIX}${recipeId}`;
/** A backup older than this (since its last write) is ignored and deleted. */
export const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The editor's safety net for text the server has not confirmed yet (tab closed, phone locked,
 * offline, session expired, logout): a synchronous localStorage copy, written on every change and
 * deleted once a save that includes the newest change succeeded. Tagged with the user id, so one
 * person's backup is never applied for another on a shared browser. A clean logout deletes the
 * user's backups (`clearAllFor`); any backup expires 7 days after its last write.
 *
 * Storage may be missing, full or blocked: every access is wrapped, and then the editor simply works
 * without a backup.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedBackup {
  read(recipeId: string, userId: string): Backup | null {
    try {
      const raw = localStorage.getItem(backupKey(recipeId));
      if (!raw) return null;
      const b = JSON.parse(raw) as Partial<Backup> | null;
      if (!b || b.userId !== userId || typeof b.baseVersion !== 'number' || !b.input || typeof b.input !== 'object') {
        return null;
      }
      if (typeof b.savedAt !== 'number' || Date.now() - b.savedAt > BACKUP_TTL_MS) {
        localStorage.removeItem(backupKey(recipeId));
        return null;
      }
      return b as Backup;
    } catch {
      return null;
    }
  }

  write(recipeId: string, userId: string, input: RecipeInput): void {
    const b: Backup = { input, baseVersion: input.version, savedAt: Date.now(), userId };
    try {
      localStorage.setItem(backupKey(recipeId), JSON.stringify(b));
    } catch {
      // storage unavailable or full: no backup, the editor carries on
    }
  }

  /** Deletes every backup of this user (after a logout that saved everything). */
  clearAllFor(userId: string): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      for (const k of keys) {
        try {
          if ((JSON.parse(localStorage.getItem(k) ?? 'null') as Partial<Backup> | null)?.userId === userId) localStorage.removeItem(k);
        } catch {
          // unreadable entry: leave it (read() ignores it)
        }
      }
    } catch {
      // storage unavailable
    }
  }

  /** Deletes this user's backup of the recipe (another user's is left alone). */
  clear(recipeId: string, userId: string): void {
    try {
      const raw = localStorage.getItem(backupKey(recipeId));
      if (raw === null) return;
      let owner: unknown = null;
      try {
        owner = (JSON.parse(raw) as Partial<Backup> | null)?.userId;
      } catch {
        owner = userId; // unreadable: nobody can use it
      }
      if (owner === userId) localStorage.removeItem(backupKey(recipeId));
    } catch {
      // storage unavailable
    }
  }
}
