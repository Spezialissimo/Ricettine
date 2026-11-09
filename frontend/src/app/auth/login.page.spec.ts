import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { AuthStore } from '../core/auth.store';
import { LoginPage } from './login.page';

const me = { id: '1', email: 'a@b.c', username: 'abc', displayName: 'Abc', avatarUrl: null, admin: false };

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  function setup(next?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(next ? { next } : {}) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn_navigate();
    const f = TestBed.createComponent(LoginPage);
    return f;
  }
  let nav: ReturnType<typeof vi.spyOn>;
  function spyOn_navigate() {
    nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  }

  async function submit(f: ReturnType<typeof setup>) {
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const set = (sel: string, v: string) => {
      const i = el.querySelector(sel) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('input[type=email]', 'a@b.c');
    set('input[type=password]', 'secret12345');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(f);
  }

  afterEach(() => http.verify());

  it('shows errors.bad_credentials on a 401', async () => {
    const f = setup();
    await submit(f);
    http.expectOne('/api/auth/login').flush({ code: 'bad_credentials' }, { status: 401, statusText: 'x' });
    await settle(f);
    expect((f.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toContain(
      en.errors.bad_credentials,
    );
    expect(nav).not.toHaveBeenCalled();
  });

  it('ignores a protocol-relative next and goes to /', async () => {
    const f = setup('//evil.com');
    await submit(f);
    http.expectOne('/api/auth/login').flush(me);
    await settle(f);
    expect(nav).toHaveBeenCalledWith('/');
    expect(TestBed.inject(AuthStore).me()).toEqual(me);
  });

  it('honors a same-origin next path', async () => {
    const f = setup('/settings?x=1');
    await submit(f);
    http.expectOne('/api/auth/login').flush(me);
    await settle(f);
    expect(nav).toHaveBeenCalledWith('/settings?x=1');
  });

  it('empty submit shows auth.fillBoth in an alert and marks both inputs invalid and described', async () => {
    const f = setup();
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.auth.fillBoth);
    for (const sel of ['input[type=email]', 'input[type=password]']) {
      const i = el.querySelector(sel)!;
      expect(i.getAttribute('aria-invalid')).toBe('true');
      const id = i.getAttribute('aria-describedby')!;
      expect(id).toBeTruthy();
      expect(el.querySelector(`#${id}`)).not.toBeNull();
      expect(i.closest('label')!.contains(el.querySelector(`#${id}`))).toBe(false);
    }
  });
});
