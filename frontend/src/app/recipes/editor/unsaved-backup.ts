import { Injectable } from '@angular/core';
import { RecipeInput } from '../recipe.model';

/** What is kept per recipe: the working copy, the server version it is based on, when, and whose it is. */
export type Backup = { input: RecipeInput; baseVersion: number; savedAt: number; userId: string };

export const backupKey = (recipeId: string) => `ricettine.unsaved.${recipeId}`;

/**
 * The editor's safety net for text the server has not confirmed yet (tab closed, phone locked,
 * offline, session expired, logout): a synchronous localStorage copy, written on every change and
 * deleted once a save that includes the newest change succeeded. Tagged with the user id, so one
 * person's backup is never applied for another on a shared browser.
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
