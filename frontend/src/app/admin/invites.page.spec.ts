import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { InvitesPage } from './invites.page';

describe('InvitesPage', () => {
  it('lists, creates (showing url) and revokes invites', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(InvitesPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    http.expectOne('/api/admin/invites').flush([{ id: 'i1', createdAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-08T00:00:00Z' }]);
    await settle(f);
    expect(el.querySelectorAll('[data-invite]').length).toBe(1);

    (el.querySelector('[data-action=create]') as HTMLButtonElement).click();
    await settle(f);
    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/invites');
    post.flush({ id: 'i2', url: 'https://h/invite/tok2', expiresAt: '2030-01-09T00:00:00Z' }, { status: 201, statusText: 'Created' });
    await settle(f);
    expect(el.textContent).toContain('https://h/invite/tok2');
    expect(el.querySelectorAll('[data-invite]').length).toBe(2);

    (el.querySelector('[data-invite="i1"] button') as HTMLButtonElement).click();
    await settle(f);
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/admin/invites/i1').flush(null, { status: 204, statusText: 'x' });
    await settle(f);
    expect(el.querySelector('[data-invite="i1"]')).toBeNull();
    expect(el.querySelectorAll('[data-invite]').length).toBe(1);
    http.verify();
  });
});
