import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore, Me } from './auth.store';

const me: Me = {
  id: '1', email: 'a@b.c', username: 'abc', displayName: 'Abc', avatarUrl: null, admin: false,
};

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
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
    http.expectOne('/api/me').flush({ code: 'not_authenticated' }, { status: 401, statusText: 'x' });
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
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(store.me()).toBeNull();
  });
});
