import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SetupStatus } from '../core/auth.guards';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { DeleteAccountPage } from './delete-account.page';

describe('DeleteAccountPage', () => {
  async function run(status: number, body: object | null, setupRequired = false) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    const http = TestBed.inject(HttpTestingController);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refresh = vi.spyOn(TestBed.inject(SetupStatus), 'refresh');
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'A', avatarUrl: null, admin: true });
    const f = TestBed.createComponent(DeleteAccountPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const i = el.querySelector('input[type=password]') as HTMLInputElement;
    i.value = 'mypassword12';
    i.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(f);
    const req = http.expectOne('/api/me');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 'mypassword12' });
    req.flush(body, { status, statusText: 'x' });
    await settle(f);
    if (status === 204) {
      http.expectOne('/api/setup/status').flush({ setupRequired });
      await settle(f);
    }
    return { el, nav, refresh };
  }

  it('shows last_admin on 409 and stays signed in', async () => {
    const { el, nav } = await run(409, { code: 'last_admin' });
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.last_admin);
    expect(nav).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthStore).me()).not.toBeNull();
  });

  it('on success clears the store and goes to /login', async () => {
    const { nav, refresh } = await run(204, null, false);
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(refresh).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/login');
  });

  it('on success goes to /setup when setup is required again', async () => {
    const { nav } = await run(204, null, true);
    expect(nav).toHaveBeenCalledWith('/setup');
  });
});
