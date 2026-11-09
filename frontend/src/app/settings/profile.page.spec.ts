import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore, Me } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { ProfilePage } from './profile.page';

const me: Me = {
  id: '1',
  email: 'a@b.c',
  username: 'ann',
  displayName: 'Ann',
  avatarUrl: null,
  admin: false,
};

describe('ProfilePage', () => {
  function setup(user: Me = me) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTestTransloco(),
      ],
    });
    TestBed.inject(AuthStore).setMe(user);
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ProfilePage);
    return { http, f, el: f.nativeElement as HTMLElement };
  }

  it('saves the display name and updates the AuthStore', async () => {
    const { http, f, el } = setup();
    await settle(f);
    const input = el.querySelector('input[name=displayName]') as HTMLInputElement;
    expect(input.value).toBe('Ann');
    input.value = '  New Name ';
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(f);
    const req = http.expectOne('/api/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'New Name' });
    req.flush({ ...me, displayName: 'New Name' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()?.displayName).toBe('New Name');
    http.verify();
  });

  function pick(el: HTMLElement, file: File) {
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('file input accepts jpeg/png/webp and has no capture attribute', async () => {
    const { f, el } = setup();
    await settle(f);
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('rejects a file over 15 MB client-side without any request', async () => {
    const { http, f, el } = setup();
    await settle(f);
    pick(el, new File([new ArrayBuffer(16 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' }));
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.file_too_large);
    http.expectNone('/api/me/avatar');
  });

  it('uploads the avatar as multipart field "file" and shows the returned avatar', async () => {
    const { http, f, el } = setup();
    await settle(f);
    pick(el, new File([new Uint8Array([1, 2, 3])], 'me.jpg', { type: 'image/jpeg' }));
    await settle(f);
    const req = http.expectOne('/api/me/avatar');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush({ ...me, avatarUrl: '/media/avatars/x.jpg' });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()?.avatarUrl).toBe('/media/avatars/x.jpg');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/media/avatars/x.jpg');
  });

  it('maps unsupported_image from the server', async () => {
    const { http, f, el } = setup();
    await settle(f);
    pick(el, new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' }));
    await settle(f);
    http
      .expectOne('/api/me/avatar')
      .flush({ code: 'unsupported_image' }, { status: 415, statusText: 'x' });
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.unsupported_image);
  });

  const removeButton = (el: HTMLElement) =>
    el.querySelector('button[data-action="remove-avatar"]') as HTMLButtonElement | null;

  it('has no remove button without an avatar', async () => {
    const { f, el } = setup();
    await settle(f);
    expect(removeButton(el)).toBeNull();
  });

  it('removes the avatar and updates the AuthStore', async () => {
    const { http, f, el } = setup({ ...me, avatarUrl: '/media/avatars/x.jpg' });
    await settle(f);
    const btn = removeButton(el)!;
    expect(btn.textContent?.trim()).toBe(en.settings.avatarRemove);
    btn.click();
    await settle(f);
    const req = http.expectOne('/api/me/avatar');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ...me, avatarUrl: null });
    await settle(f);
    expect(TestBed.inject(AuthStore).me()?.avatarUrl).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(removeButton(el)).toBeNull();
    http.verify();
  });

  it('shows a server error when removal fails and keeps the avatar', async () => {
    const { http, f, el } = setup({ ...me, avatarUrl: '/media/avatars/x.jpg' });
    await settle(f);
    removeButton(el)!.click();
    await settle(f);
    http
      .expectOne('/api/me/avatar')
      .flush({ code: 'internal_error' }, { status: 500, statusText: 'x' });
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.internal_error);
    expect(TestBed.inject(AuthStore).me()?.avatarUrl).toBe('/media/avatars/x.jpg');
  });
});
