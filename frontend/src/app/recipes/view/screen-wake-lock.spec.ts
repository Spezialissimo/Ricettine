import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScreenWakeLock } from './screen-wake-lock';
import { installWakeLock, removeWakeLock } from './screen-wake-lock.testing';

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};
const flush = () => new Promise((r) => setTimeout(r));

/** A ScreenWakeLock with its own injector, so destroying it runs its cleanup. */
function create() {
  TestBed.configureTestingModule({ providers: [ScreenWakeLock] });
  const injector = Injector.create({
    providers: [ScreenWakeLock],
    parent: TestBed.inject(Injector),
  });
  const wake = runInInjectionContext(injector, () => injector.get(ScreenWakeLock));
  return { wake, destroy: () => (injector as unknown as { destroy(): void }).destroy() };
}

describe('ScreenWakeLock', () => {
  afterEach(() => {
    removeWakeLock();
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });

  it('reports whether the API exists', () => {
    removeWakeLock();
    expect(create().wake.supported).toBe(false);
    TestBed.resetTestingModule();
    installWakeLock();
    expect(create().wake.supported).toBe(true);
  });

  it('on requests a screen lock; off releases it', async () => {
    const wl = installWakeLock();
    const { wake } = create();
    wake.toggle(true);
    await flush();
    expect(wake.on()).toBe(true);
    expect(wl.requests).toEqual(['screen']);
    wake.toggle(false);
    await flush();
    expect(wake.on()).toBe(false);
    expect(wl.sentinels[0].releases).toBe(1);
  });

  it('turns itself off quietly when the request is refused', async () => {
    installWakeLock(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wake } = create();
    wake.toggle(true);
    await flush();
    expect(wake.on()).toBe(false);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('requests again when the page becomes visible without a live lock', async () => {
    const wl = installWakeLock();
    const { wake } = create();
    wake.toggle(true);
    await flush();
    setVisibility('hidden');
    wl.sentinels[0].dispatchEvent(new Event('release')); // the browser drops the lock while hidden
    setVisibility('visible');
    await flush();
    expect(wl.requests).toEqual(['screen', 'screen']);
  });

  it('does not request again while the lock is live, or once switched off', async () => {
    const wl = installWakeLock();
    const { wake } = create();
    wake.toggle(true);
    await flush();
    setVisibility('visible');
    await flush();
    expect(wl.requests.length).toBe(1);
    wake.toggle(false);
    setVisibility('visible');
    await flush();
    expect(wl.requests.length).toBe(1);
  });

  it('releases when its page goes, and stops listening', async () => {
    const wl = installWakeLock();
    const { wake, destroy } = create();
    wake.toggle(true);
    await flush();
    destroy();
    await flush();
    expect(wl.sentinels[0].releases).toBe(1);
    setVisibility('visible');
    await flush();
    expect(wl.requests.length).toBe(1);
  });
});
