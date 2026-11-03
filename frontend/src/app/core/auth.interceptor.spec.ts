import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthStore, Me } from './auth.store';

@Component({ template: '' })
class Blank {}

const me: Me = {
  id: '1', email: 'a@b.c', username: 'abc', displayName: 'Abc', avatarUrl: null, admin: false,
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctl: HttpTestingController;
  let router: Router;
  let store: AuthStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'settings/profile', component: Blank },
          { path: 'login', component: Blank },
          { path: 'invite/:token', component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctl = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    store = TestBed.inject(AuthStore);
    store.setMe(me);
    await router.navigateByUrl('/settings/profile');
    navigate = vi.spyOn(router, 'navigateByUrl');
  });
  afterEach(() => ctl.verify());

  function fail(method: string, url: string, status: number): Promise<unknown> {
    const result = new Promise((resolve) =>
      http.request(method, url).subscribe({ next: resolve, error: resolve }),
    );
    ctl.expectOne((r) => r.url === url && r.method === method).flush(null, { status, statusText: 'x' });
    return result;
  }

  it('401 on PATCH /api/me clears me and goes to login with next', async () => {
    const err = (await fail('PATCH', '/api/me', 401)) as { status: number };
    expect(err.status).toBe(401);
    expect(store.me()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0].toString()).toBe('/login?next=%2Fsettings%2Fprofile');
  });

  it('401 on GET /api/me does nothing', async () => {
    await fail('GET', '/api/me', 401);
    expect(store.me()).toEqual(me);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('401 on POST /api/auth/login does nothing', async () => {
    await fail('POST', '/api/auth/login', 401);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('403 does nothing', async () => {
    await fail('PATCH', '/api/me', 403);
    expect(store.me()).toEqual(me);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('non-api 401 does nothing', async () => {
    await fail('GET', '/other', 401);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate from a guest page', async () => {
    await router.navigateByUrl('/invite/abc');
    navigate.mockClear();
    await fail('POST', '/api/something', 401);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates only once for simultaneous 401s', async () => {
    await Promise.all([fail('PATCH', '/api/me', 401), fail('POST', '/api/x', 401), fail('GET', '/api/y', 401)]);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('401 while never logged in does not navigate', async () => {
    store.setMe(null);
    await fail('POST', '/api/something', 401);
    expect(store.me()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a rejected navigation is swallowed and the next lost session redirects again', async () => {
    // An unhandled rejection would fail the Vitest run.
    navigate.mockRejectedValueOnce(new Error('navigation failed'));
    await fail('PATCH', '/api/me', 401);
    await new Promise((r) => setTimeout(r, 0));
    store.setMe(me);
    await fail('PATCH', '/api/me', 401);
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
