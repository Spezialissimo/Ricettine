import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { SetupStatus, adminGuard, authGuard, guestGuard, setupGuard } from './auth.guards';
import { AuthStore, Me } from './auth.store';

const me: Me = {
  id: '1',
  email: 'a@b.c',
  username: 'abc',
  displayName: 'Abc',
  avatarUrl: null,
  admin: false,
};
const route = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

describe('guards', () => {
  let store: AuthStore;
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(AuthStore);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const run = (g: typeof authGuard, url = '/x') =>
    TestBed.runInInjectionContext(() => g(route, state(url)));

  it('authGuard redirects anonymous users to /login?next=', () => {
    const r = run(authGuard, '/settings') as UrlTree;
    expect(router.serializeUrl(r)).toBe('/login?next=%2Fsettings');
  });

  it('authGuard allows signed-in users', () => {
    store.setMe(me);
    expect(run(authGuard)).toBe(true);
  });

  it('adminGuard rejects non-admins and allows admins', () => {
    store.setMe(me);
    expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/');
    store.setMe({ ...me, admin: true });
    expect(run(adminGuard)).toBe(true);
  });

  it('adminGuard sends anonymous users to login', () => {
    expect(router.serializeUrl(run(adminGuard, '/admin') as UrlTree)).toBe('/login?next=%2Fadmin');
  });

  it('guestGuard redirects signed-in users home', () => {
    store.setMe(me);
    expect(router.serializeUrl(run(guestGuard) as UrlTree)).toBe('/');
    store.setMe(null);
    expect(run(guestGuard)).toBe(true);
  });

  it('setupGuard redirects to /setup when setup is required', async () => {
    const p = run(setupGuard, '/login') as Promise<boolean | UrlTree>;
    http.expectOne('/api/setup/status').flush({ setupRequired: true });
    expect(router.serializeUrl((await p) as UrlTree)).toBe('/setup');
  });

  it('setupGuard lets /setup through when required', async () => {
    const p = run(setupGuard, '/setup') as Promise<boolean | UrlTree>;
    http.expectOne('/api/setup/status').flush({ setupRequired: true });
    expect(await p).toBe(true);
  });

  it('setupGuard redirects /setup home when not required, and caches the answer', async () => {
    const p = run(setupGuard, '/setup') as Promise<boolean | UrlTree>;
    http.expectOne('/api/setup/status').flush({ setupRequired: false });
    expect(router.serializeUrl((await p) as UrlTree)).toBe('/');
    expect(await (run(setupGuard, '/login') as Promise<boolean>)).toBe(true); // no new request
  });

  it('setupGuard refresh re-checks', async () => {
    const p = run(setupGuard, '/login') as Promise<boolean | UrlTree>;
    http.expectOne('/api/setup/status').flush({ setupRequired: false });
    await p;
    TestBed.inject(SetupStatus).refresh();
    const p2 = run(setupGuard, '/login') as Promise<boolean | UrlTree>;
    http.expectOne('/api/setup/status').flush({ setupRequired: true });
    expect(router.serializeUrl((await p2) as UrlTree)).toBe('/setup');
  });
});
