import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { ResetPasswordPage } from './reset-password.page';

describe('ResetPasswordPage', () => {
  async function run(status: number, body: object | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ResetPasswordPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const i = el.querySelector('input[type=password]') as HTMLInputElement;
    i.value = 'longenough1';
    i.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(f);
    const req = http.expectOne('/api/password-resets/tok');
    expect(req.request.body).toEqual({ newPassword: 'longenough1' });
    req.flush(body, { status, statusText: 'x' });
    await settle(f);
    http.verify();
    return el;
  }

  it('shows success with a login link', async () => {
    const el = await run(204, null);
    expect(el.textContent).toContain(en.reset.done);
    expect(el.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it('shows reset_invalid', async () => {
    const el = await run(404, { code: 'reset_invalid' });
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.reset_invalid);
  });
});
