import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { fillForm, settle } from '../testing/spec-helpers';
import { PasswordPage } from './password.page';

describe('PasswordPage', () => {
  async function run(status: number, body: object | null) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PasswordPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    fillForm(el, { currentPassword: 'oldpassword1', newPassword: 'newpassword1' });
    await settle(f);
    const req = http.expectOne('/api/me/password');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ currentPassword: 'oldpassword1', newPassword: 'newpassword1' });
    req.flush(body, { status, statusText: 'x' });
    await settle(f);
    return el;
  }

  it('confirms on 204', async () => {
    expect((await run(204, null)).textContent).toContain(en.settings.passwordDone);
  });
  it('shows bad_credentials', async () => {
    const el = await run(400, { code: 'bad_credentials' });
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.bad_credentials);
  });
});
