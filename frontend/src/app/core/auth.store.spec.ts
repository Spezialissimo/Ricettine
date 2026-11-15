import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore, Me } from './auth.store';
import { PendingSaves } from './pending-saves';
import { provideSite } from '../testing/site';

const me: Me = {
  id: '1',
  email: 'a@b.c',
  username: 'abc',
  displayName: 'Abc',
  avatarUrl: null,
  admin: false,
};

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('load sets me on 200', async () => {
    const p = store.load();
    http.expectOne('/api/me').flush(me);
    await p;
    expect(store.me()).toEqual(me);
    expect(store.ready()).toBe(true);
  });

  it('load sets null on 401', async () => {
    const p = store.load();
    http
      .expectOne('/api/me')
      .flush({ code: 'not_authenticated' }, { status: 401, statusText: 'x' });
    await p;
    expect(store.me()).toBeNull();
    expect(store.ready()).toBe(true);
  });

  it('login posts credentials and sets me', async () => {
    const p = store.login('a@b.c', 'secret12345');
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.c', password: 'secret12345' });
    req.flush(me);
    await p;
    expect(store.me()).toEqual(me);
  });

  it('logout clears me', async () => {
    store.setMe(me);
    const p = store.logout();
    await new Promise((r) => setTimeout(r)); // pending saves are flushed first (none here)
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(store.me()).toBeNull();
  });

  it('logout first waits for pending saves (open editors) while the session is still valid', async () => {
    let finish!: () => void;
    const flush = vi.fn(() => new Promise<void>((r) => (finish = r)));
    TestBed.inject(PendingSaves).register(flush);
    const p = store.logout();
    await Promise.resolve();
    expect(flush).toHaveBeenCalled();
    http.expectNone('/api/auth/logout');
    finish();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(store.me()).toBeNull();
  });

  it('a hung save does not block logout: it goes ahead after the flush timeout', async () => {
    vi.useFakeTimers();
    try {
      store.setMe(me);
      TestBed.inject(PendingSaves).register(() => new Promise<void>(() => {}));
      const p = store.logout();
      await vi.advanceTimersByTimeAsync(4999);
      http.expectNone('/api/auth/logout');
      await vi.advanceTimersByTimeAsync(1);
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await p;
      expect(store.me()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout clears me even when the request fails', async () => {
    store.setMe(me);
    const p = store.logout();
    await new Promise((r) => setTimeout(r)); // pending saves are flushed first (none here)
    http
      .expectOne('/api/auth/logout')
      .flush({ code: 'not_authenticated' }, { status: 401, statusText: 'x' });
    await p;
    expect(store.me()).toBeNull();
  });

  it.each([0, 500])(
    'logout keeps me set and rejects with an ApiError when the request fails with %i',
    async (status) => {
      store.setMe(me);
      const p = store.logout();
      const rejected = p.then(
        () => null,
        (e: unknown) => e,
      );
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/auth/logout').flush(null, { status, statusText: 'x' });
      expect(await rejected).toMatchObject({
        status,
        code: status === 0 ? 'network_error' : 'unknown',
      });
      expect(store.me()).toEqual(me);
    },
  );
});

describe('AuthStore on the demo site', () => {
  const unauth = { status: 401, statusText: 'x' };
  function setup(demo: boolean) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideSite({ demo })],
    });
    return { store: TestBed.inject(AuthStore), http: TestBed.inject(HttpTestingController) };
  }

  it('demoAutoSignsInOn401: a 401 from /api/me starts a demo session and retries /api/me', async () => {
    const { store, http } = setup(true);
    const p = store.load();
    http.expectOne('/api/me').flush({ code: 'not_authenticated' }, unauth);
    await Promise.resolve();
    const session = http.expectOne('/api/demo/session');
    expect(session.request.method).toBe('POST');
    session.flush(null, { status: 204, statusText: 'No Content' });
    await Promise.resolve();
    http.expectOne('/api/me').flush(me);
    await p;
    expect(store.me()).toEqual(me);
    expect(store.ready()).toBe(true);
    http.verify();
  });

  it('mainDoesNotCallDemoSession: on the main site a 401 just leaves me null', async () => {
    const { store, http } = setup(false);
    const p = store.load();
    http.expectOne('/api/me').flush({ code: 'not_authenticated' }, unauth);
    await p;
    expect(store.me()).toBeNull();
    http.expectNone('/api/demo/session');
    http.verify();
  });

  it('demoRetriesMeOnce: a second 401 leaves me null and does not loop', async () => {
    const { store, http } = setup(true);
    const p = store.load();
    http.expectOne('/api/me').flush(null, unauth);
    await Promise.resolve();
    http.expectOne('/api/demo/session').flush(null, { status: 204, statusText: 'x' });
    await Promise.resolve();
    http.expectOne('/api/me').flush(null, unauth);
    await p;
    expect(store.me()).toBeNull();
    expect(store.ready()).toBe(true);
    http.verify();
  });

  it('a failing demo session call stops with me null', async () => {
    const { store, http } = setup(true);
    const p = store.load();
    http.expectOne('/api/me').flush(null, unauth);
    await Promise.resolve();
    http
      .expectOne('/api/demo/session')
      .flush({ code: 'demo_unavailable' }, { status: 503, statusText: 'x' });
    await p;
    expect(store.me()).toBeNull();
    http.verify();
  });

  it('concurrent reauthenticate calls share one demo session request', async () => {
    const { store, http } = setup(true);
    const a = store.reauthenticate();
    const b = store.reauthenticate();
    http.expectOne('/api/demo/session').flush(null, { status: 204, statusText: 'x' });
    await Promise.resolve();
    http.expectOne('/api/me').flush(me);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    http.verify();
  });
});
