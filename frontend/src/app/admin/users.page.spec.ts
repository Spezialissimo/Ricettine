import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore, Me } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { UsersPage } from './users.page';

const me: Me = { id: 'u1', email: 'a@x.y', username: 'ann', displayName: 'Ann', avatarUrl: null, admin: true };
const ann = { id: 'u1', username: 'ann', displayName: 'Ann', email: 'a@x.y', admin: true, createdAt: '2030-01-01T00:00:00Z' };
const bob = { id: 'u2', username: 'bob', displayName: 'Bob', email: 'b@x.y', admin: false, createdAt: '2030-01-02T00:00:00Z' };

describe('UsersPage', () => {
  async function setup(users: unknown[]) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    TestBed.inject(AuthStore).setMe(me);
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(UsersPage);
    await settle(f);
    http.expectOne('/api/admin/users').flush(users);
    await settle(f);
    return { http, f, el: f.nativeElement as HTMLElement };
  }

  const roleButton = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-user="${id}"] button[data-action="role"]`) as HTMLButtonElement | null;

  it('lists users and shows a reset link for one', async () => {
    const { http, f, el } = await setup([ann, bob]);
    expect(el.querySelectorAll('[data-user]').length).toBe(2);
    (el.querySelector('[data-user="u2"] button[data-action="reset"]') as HTMLButtonElement).click();
    await settle(f);
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/users/u2/password-reset')
      .flush({ url: 'https://h/reset/tokx', expiresAt: '2030-02-01T00:00:00Z' }, { status: 201, statusText: 'Created' });
    await settle(f);
    expect(el.textContent).toContain('https://h/reset/tokx');
    http.verify();
  });

  it('promotes a user and updates the row', async () => {
    const { http, f, el } = await setup([ann, bob]);
    const btn = roleButton(el, 'u2')!;
    expect(btn.textContent?.trim()).toBe(en.admin.makeAdmin);
    btn.click();
    await settle(f);
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/users/u2/admin');
    expect(req.request.body).toEqual({ admin: true });
    req.flush({ ...bob, admin: true });
    await settle(f);
    expect(roleButton(el, 'u2')!.textContent?.trim()).toBe(en.admin.removeAdmin);
    expect(el.querySelector('[data-user="u2"]')!.textContent).toContain(en.admin.adminBadge);
    // with a second admin, Ann may now step down
    expect(roleButton(el, 'u1')!.textContent?.trim()).toBe(en.admin.removeAdmin);
    http.verify();
  });

  it('hides the role action on yourself when you are the last admin', async () => {
    const { el } = await setup([ann, bob]);
    expect(roleButton(el, 'u1')).toBeNull();
    expect(roleButton(el, 'u2')).not.toBeNull();
  });

  it('demotes another admin', async () => {
    const { http, f, el } = await setup([ann, { ...bob, admin: true }]);
    roleButton(el, 'u2')!.click();
    await settle(f);
    const req = http.expectOne('/api/admin/users/u2/admin');
    expect(req.request.body).toEqual({ admin: false });
    req.flush({ ...bob, admin: false });
    await settle(f);
    expect(roleButton(el, 'u2')!.textContent?.trim()).toBe(en.admin.makeAdmin);
    expect(roleButton(el, 'u1')).toBeNull();
  });

  it('stepping down yourself signs you out (the server ended your sessions)', async () => {
    const { http, f, el } = await setup([ann, { ...bob, admin: true }]);
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    roleButton(el, 'u1')!.click();
    await settle(f);
    http.expectOne('/api/admin/users/u1/admin').flush({ ...ann, admin: false });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
  });

  it('shows last_admin from the server', async () => {
    const { http, f, el } = await setup([ann, { ...bob, admin: true }]);
    roleButton(el, 'u2')!.click();
    await settle(f);
    http.expectOne('/api/admin/users/u2/admin').flush({ code: 'last_admin' }, { status: 409, statusText: 'Conflict' });
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.last_admin);
  });
});
