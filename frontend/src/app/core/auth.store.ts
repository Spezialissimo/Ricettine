import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UnsavedBackup } from '../recipes/editor/unsaved-backup';
import { PendingSaves } from './pending-saves';

export type Me = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  admin: boolean;
};

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly pending = inject(PendingSaves);
  private readonly backups = inject(UnsavedBackup);
  private readonly _me = signal<Me | null>(null);
  private readonly _ready = signal(false);

  readonly me = this._me.asReadonly();
  readonly ready = this._ready.asReadonly();

  /** GET /api/me (also makes the backend set the XSRF cookie). 401 means signed out. */
  async load(): Promise<void> {
    try {
      this._me.set(await firstValueFrom(this.http.get<Me>('/api/me')));
    } catch {
      // 401 means signed out; if the backend is unreachable also start signed-out.
      this._me.set(null);
    } finally {
      this._ready.set(true);
    }
  }

  async login(email: string, password: string): Promise<void> {
    this._me.set(await firstValueFrom(this.http.post<Me>('/api/auth/login', { email, password })));
  }

  /**
   * Sends unsaved work of open pages first (the session must still be valid for that), then logs out.
   * If everything was saved, this user's local backups go too; otherwise they stay for the next login.
   */
  async logout(): Promise<void> {
    const userId = this._me()?.id ?? null;
    const clean = await this.pending.flushAll();
    if (clean && userId) this.backups.clearAllFor(userId);
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    } catch {
      // e.g. 401 on an expired session: nothing to revoke server-side, still sign out locally.
    } finally {
      this._me.set(null);
    }
  }

  setMe(me: Me | null): void {
    this._me.set(me);
  }
}
