import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SetupStatus } from '../core/auth.guards';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { DeleteAccountPage } from './delete-account.page';

describe('DeleteAccountPage', () => {
  const summary = (name: string, role: 'OWNER' | 'AUTHOR') => ({
    id: name, name, visibility: 'PRIVATE', role, recipeCount: 0, coverThumbUrl: null, updatedAt: '2026-01-01T00:00:00Z',
  });

  async function run(status: number, body: object | null, setupRequired = false, mine: object[] | 'fail' = []) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    const http = TestBed.inject(HttpTestingController);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refresh = vi.spyOn(TestBed.inject(SetupStatus), 'refresh');
    TestBed.inject(AuthStore).setMe({ id: '1', email: 'a@b.c', username: 'ann', displayName: 'A', avatarUrl: null, admin: true });
    const f = TestBed.createComponent(DeleteAccountPage);
    await settle(f);
    const mineReq = http.expectOne('/api/cookbooks/mine');
    if (mine === 'fail') mineReq.flush(null, { status: 500, statusText: 'x' });
    else mineReq.flush(mine);
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

  it('lists the cookbooks that will be deleted, owned ones only', async () => {
    const { el } = await run(409, { code: 'last_admin' }, false, [
      summary('Soups', 'OWNER'), summary('Shared', 'AUTHOR'), summary('Desserts', 'OWNER'),
    ]);
    const items = Array.from(el.querySelectorAll('[data-owned-cookbooks] li')).map((li) => li.textContent?.trim());
    expect(items).toEqual(['Soups', 'Desserts']);
    expect(el.textContent).toContain(en.settings.deleteCookbooks);
  });

  it('has no list when the user owns no cookbook', async () => {
    const { el } = await run(409, { code: 'last_admin' }, false, [summary('Shared', 'AUTHOR')]);
    expect(el.querySelector('[data-owned-cookbooks]')).toBeNull();
    expect(el.textContent).not.toContain(en.settings.deleteCookbooksUnknown);
  });

  it('says it cannot tell when the cookbooks fail to load, and the form still works', async () => {
    const { el } = await run(409, { code: 'last_admin' }, false, 'fail');
    expect(el.textContent).toContain(en.settings.deleteCookbooksUnknown);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.last_admin);
  });

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
