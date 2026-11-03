import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTestTransloco, settle } from './testing/transloco';
import { AuthStore } from './core/auth.store';
import { HomePage } from './home.page';

describe('HomePage', () => {
  it('greets the user and logs out to /login', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco()],
    });
    TestBed.inject(AuthStore).setMe({
      id: '1', email: 'a@b.co', username: 'd', displayName: 'Davide', avatarUrl: null, admin: false,
    });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(HomePage);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Hi Davide');
    (el.querySelector('button') as HTMLButtonElement).click();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'x' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
  });
});
