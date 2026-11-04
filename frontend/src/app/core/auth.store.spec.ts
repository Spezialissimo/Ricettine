import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthStore, Me } from './auth.store';
import { PendingSaves } from './pending-saves';
import { UnsavedBackup } from '../recipes/editor/unsaved-backup';

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

  describe('local backups of unsaved recipe text', () => {
    const input = { version: 1, title: 'x', portions: 1, prepMinutes: null, cookMinutes: null, source: null, notes: null,
      visibility: 'PRIVATE' as const, coverMediaId: null, groups: [], steps: [] };
    beforeEach(() => {
      localStorage.clear();
      const b = TestBed.inject(UnsavedBackup);
      b.write('r1', '1', input);
      b.write('r2', 'someone-else', input);
      store.setMe(me);
    });
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    it('a logout whose flush succeeded clears this user\'s backups (only theirs)', async () => {
      TestBed.inject(PendingSaves).register(() => Promise.resolve());
      const p = store.logout();
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await p;
      expect(localStorage.getItem('ricettine.unsaved.r1')).toBeNull();
      expect(localStorage.getItem('ricettine.unsaved.r2')).not.toBeNull();
    });

    it('a logout whose flush failed keeps the backups', async () => {
      TestBed.inject(PendingSaves).register(() => Promise.reject(new Error('offline')));
      const p = store.logout();
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await p;
      expect(localStorage.getItem('ricettine.unsaved.r1')).not.toBeNull();
    });

    it('a logout whose flush timed out keeps the backups', async () => {
      vi.useFakeTimers();
      TestBed.inject(PendingSaves).register(() => new Promise<void>(() => {}));
      const p = store.logout();
      await vi.advanceTimersByTimeAsync(5000);
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await p;
      expect(store.me()).toBeNull();
      expect(localStorage.getItem('ricettine.unsaved.r1')).not.toBeNull();
    });
  });

  it('logout clears me even when the request fails', async () => {
    store.setMe(me);
    const p = store.logout();
    await new Promise((r) => setTimeout(r)); // pending saves are flushed first (none here)
    http.expectOne('/api/auth/logout').flush({ code: 'not_authenticated' }, { status: 401, statusText: 'x' });
    await p;
    expect(store.me()).toBeNull();
  });
});
