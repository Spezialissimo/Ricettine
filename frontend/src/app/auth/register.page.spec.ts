import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { AuthStore } from '../core/auth.store';
import { RegisterPage } from './register.page';

const me = { id: '1', email: 'a@b.co', username: 'davide', displayName: 'D', avatarUrl: null, admin: false };

describe('RegisterPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(RegisterPage);
  }
  afterEach(() => http.verify());

  it('shows the invalid message and no form on 404', async () => {
    const f = setup();
    await settle(f);
    http.expectOne('/api/invites/tok').flush({ code: 'invite_invalid' }, { status: 404, statusText: 'x' });
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain(en.errors.invite_invalid);
    expect(el.querySelector('form')).toBeNull();
  });

  it('registers, sets me and navigates home; username_taken shows under the field', async () => {
    const f = setup();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await settle(f);
    http.expectOne('/api/invites/tok').flush({ expiresAt: 'x' });
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const type = (sel: string, v: string) => {
      const i = el.querySelector(sel) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    const fill = async () => {
      type('input[name=email]', 'a@b.co');
      type('input[name=username]', 'davide');
      type('input[name=displayName]', 'D');
      type('input[name=password]', 'longenough1');
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(f);
    };
    await fill();
    http.expectOne('/api/invites/tok/register').flush({ code: 'username_taken' }, { status: 409, statusText: 'x' });
    await settle(f);
    expect(el.querySelector('[data-error=username]')?.textContent).toContain(en.errors.username_taken);

    await fill();
    const req = http.expectOne('/api/invites/tok/register');
    expect(req.request.body).toEqual({
      email: 'a@b.co', username: 'davide', displayName: 'D', password: 'longenough1',
    });
    req.flush(me);
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toEqual(me);
    expect(nav).toHaveBeenCalledWith('/');
  });
});
