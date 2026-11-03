import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTransloco, settle } from '../testing/transloco';
import { UsersPage } from './users.page';

describe('UsersPage', () => {
  it('lists users and shows a reset link for one', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(UsersPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    http.expectOne('/api/admin/users').flush([
      { id: 'u1', username: 'ann', displayName: 'Ann', email: 'a@x.y', admin: true, createdAt: '2030-01-01T00:00:00Z' },
      { id: 'u2', username: 'bob', displayName: 'Bob', email: 'b@x.y', admin: false, createdAt: '2030-01-02T00:00:00Z' },
    ]);
    await settle(f);
    expect(el.querySelectorAll('[data-user]').length).toBe(2);
    (el.querySelector('[data-user="u2"] button') as HTMLButtonElement).click();
    await settle(f);
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/users/u2/password-reset')
      .flush({ url: 'https://h/reset/tokx', expiresAt: '2030-02-01T00:00:00Z' }, { status: 201, statusText: 'Created' });
    await settle(f);
    expect(el.textContent).toContain('https://h/reset/tokx');
    http.verify();
  });
});
