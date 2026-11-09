import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTestTransloco } from '../testing/transloco';
import { fillForm, settle } from '../testing/spec-helpers';
import { AuthStore } from '../core/auth.store';
import { SetupPage } from './setup.page';

const ACCOUNT = { email: 'a@b.co', username: 'davide', displayName: 'D', password: 'longenough1' };

describe('SetupPage', () => {
  it('creates the admin, sets me and navigates home', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTestTransloco(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(SetupPage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    fillForm(el, ACCOUNT);
    await settle(f);
    const me = {
      id: '1',
      email: 'a@b.co',
      username: 'davide',
      displayName: 'D',
      avatarUrl: null,
      admin: true,
    };
    http.expectOne('/api/setup/admin').flush(me, { status: 201, statusText: 'Created' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toEqual(me);
    expect(nav).toHaveBeenCalledWith('/');
    http.verify();
  });
});
