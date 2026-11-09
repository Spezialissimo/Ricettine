import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from './auth.store';

/** Caches GET /api/setup/status once it reports setup is no longer required. */
@Injectable({ providedIn: 'root' })
export class SetupStatus {
  private readonly http = inject(HttpClient);
  private done = false;

  async required(): Promise<boolean> {
    if (this.done) return false;
    try {
      const s = await firstValueFrom(
        this.http.get<{ setupRequired: boolean }>('/api/setup/status'),
      );
      if (!s.setupRequired) this.done = true;
      return s.setupRequired;
    } catch {
      return false; // do not lock users out if the check itself fails; not cached
    }
  }

  /** Forget the cached answer (e.g. after the last user was deleted). */
  refresh(): void {
    this.done = false;
  }
}

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  if (inject(AuthStore).me()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

export const adminGuard: CanActivateFn = (route, state) => {
  const me = inject(AuthStore).me();
  if (!me) return authGuard(route, state);
  return me.admin ? true : inject(Router).createUrlTree(['/']);
};

export const guestGuard: CanActivateFn = () =>
  inject(AuthStore).me() ? inject(Router).createUrlTree(['/']) : true;

export const setupGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const required = await inject(SetupStatus).required();
  const path = state.url.split(/[?#]/)[0];
  if (required) return path === '/setup' ? true : router.createUrlTree(['/setup']);
  return path === '/setup' ? router.createUrlTree(['/']) : true;
};
