import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { toApiError } from './api-error';
import { PendingSaves } from './pending-saves';
import { Site } from './site';

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
  private readonly site = inject(Site);
  /** The demo sign-in under way, shared by every caller so concurrent 401s make one request. */
  private demoSignIn: Promise<boolean> | null = null;
  private readonly _me = signal<Me | null>(null);
  private readonly _ready = signal(false);

  readonly me = this._me.asReadonly();
  readonly ready = this._ready.asReadonly();

  /**
   * GET /api/me (also makes the backend set the XSRF cookie). 401 means signed out, except on the demo site, where it
   * starts the guest session and asks once more. Run after `Site.load()` so the demo flag is known.
   */
  async load(): Promise<void> {
    try {
      this._me.set(await this.fetchMe());
    } catch (e) {
      if (this.site.demo() && toApiError(e).status === 401) await this.reauthenticate();
      else this._me.set(null); // 401, or the backend is unreachable: start signed-out
    } finally {
      this._ready.set(true);
    }
  }

  /**
   * Demo site only: POST /api/demo/session, then GET /api/me once. Resolves false (and leaves `me` null) if either
   * fails, so a caller never loops. Concurrent calls share one request.
   */
  reauthenticate(): Promise<boolean> {
    this.demoSignIn ??= this.startDemoSession().finally(() => (this.demoSignIn = null));
    return this.demoSignIn;
  }

  private async startDemoSession(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post<void>('/api/demo/session', null));
      this._me.set(await this.fetchMe());
      return true;
    } catch {
      this._me.set(null);
      return false;
    }
  }

  private fetchMe(): Promise<Me> {
    return firstValueFrom(this.http.get<Me>('/api/me'));
  }

  async login(email: string, password: string): Promise<void> {
    this._me.set(await firstValueFrom(this.http.post<Me>('/api/auth/login', { email, password })));
  }

  /**
   * Sends unsaved work of open pages first (the session must still be valid for that), then logs out. Rejects with an ApiError (and keeps `me`) unless the server confirmed or the session was already gone.
   * Each open editor deletes its own local backup once its flush saved it; anything not saved (failed,
   * timed out) stays in the backup for the next login.
   */
  async logout(): Promise<void> {
    await this.pending.flushAll();
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    } catch (e) {
      // 401: the session is already gone, nothing to revoke. Anything else (offline, 5xx) leaves the
      // server session alive, so stay signed in and let the caller show the error and retry.
      const err = toApiError(e);
      if (err.status !== 401) throw err;
    }
    this._me.set(null);
  }

  setMe(me: Me | null): void {
    this._me.set(me);
  }
}
