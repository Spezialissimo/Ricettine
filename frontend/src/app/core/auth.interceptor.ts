import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthStore } from './auth.store';

const GUEST_PREFIXES = ['/login', '/setup', '/invite/', '/reset/'];

function isGuestPage(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return GUEST_PREFIXES.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

function isExempt(method: string, url: string): boolean {
  const path = url.split(/[?#]/)[0];
  if (!path.startsWith('/api/')) return true;
  return (method === 'GET' && path === '/api/me') || (method === 'POST' && path === '/api/auth/login');
}

/** True while a redirect to login that this interceptor started is under way (one navigation per burst of 401s). */
@Injectable({ providedIn: 'root' })
class SessionRedirect {
  pending = false;
}

/**
 * A 401 from the API (other than the "who am I" and login calls) while signed in means the session is gone: sign out
 * locally and go to login. While already signed out, 401s are left to the caller.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthStore);
  const redirect = inject(SessionRedirect);
  return next(req).pipe(
    tap({
      error: (e: unknown) => {
        if (!(e instanceof HttpErrorResponse) || e.status !== 401 || isExempt(req.method, req.url)) return;
        // Only a session we had can expire: a 401 while signed out is the caller's to handle.
        if (auth.me() === null) return;
        auth.setMe(null);
        if (redirect.pending || isGuestPage(router.url)) return;
        redirect.pending = true;
        const next = router.url;
        void router
          .navigateByUrl(router.createUrlTree(['/login'], { queryParams: { next } }))
          .catch(() => false)
          .finally(() => (redirect.pending = false));
      },
    }),
  );
};
