import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { SetupStatus } from './setup-status';
import { Site } from './site';

export { SetupStatus };

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

/** Account pages that write (profile, password, delete): the demo has none, so it goes to Appearance. */
export const notDemoGuard: CanActivateFn = () =>
  inject(Site).demo() ? inject(Router).createUrlTree(['/settings/appearance']) : true;

export const guestGuard: CanActivateFn = () =>
  inject(AuthStore).me() ? inject(Router).createUrlTree(['/']) : true;

export const setupGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const required = await inject(SetupStatus).required();
  const path = state.url.split(/[?#]/)[0];
  if (required) return path === '/setup' ? true : router.createUrlTree(['/setup']);
  return path === '/setup' ? router.createUrlTree(['/']) : true;
};
