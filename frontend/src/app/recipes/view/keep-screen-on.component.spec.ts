import { TestBed } from '@angular/core/testing';
import { provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { KeepScreenOnComponent } from './keep-screen-on.component';

class FakeSentinel extends EventTarget {
  released = false;
  releases = 0;
  async release() {
    this.released = true;
    this.releases++;
    this.dispatchEvent(new Event('release'));
  }
}

function installWakeLock(reject = false) {
  const state = { requests: [] as string[], sentinels: [] as FakeSentinel[] };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async (type: string) => {
        state.requests.push(type);
        if (reject) throw new DOMException('no', 'NotAllowedError');
        const s = new FakeSentinel();
        state.sentinels.push(s);
        return s;
      },
    },
  });
  return state;
}

async function mount() {
  TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  const f = TestBed.createComponent(KeepScreenOnComponent);
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  const box = () => el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  const toggle = async () => {
    box()!.click();
    await settle(f);
  };
  return { f, el, box, toggle };
}

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('KeepScreenOnComponent', () => {
  afterEach(() => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });

  it('renders nothing when the Wake Lock API is absent', async () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    const { box, el } = await mount();
    expect(box()).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders a labelled checkbox; check requests a screen lock and uncheck releases it', async () => {
    const wl = installWakeLock();
    const { box, toggle, el } = await mount();
    expect(el.textContent).toContain('Keep screen on');
    await toggle();
    expect(wl.requests).toEqual(['screen']);
    expect(box()!.checked).toBe(true);
    await toggle();
    expect(wl.sentinels[0].releases).toBe(1);
    expect(box()!.checked).toBe(false);
  });

  it('unchecks quietly when the request is rejected', async () => {
    installWakeLock(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { box, toggle } = await mount();
    await toggle();
    expect(box()!.checked).toBe(false);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('requests again when the page becomes visible without a live lock', async () => {
    const wl = installWakeLock();
    const { f, toggle } = await mount();
    await toggle();
    setVisibility('hidden');
    wl.sentinels[0].dispatchEvent(new Event('release')); // the browser drops the lock while hidden
    setVisibility('visible');
    await settle(f);
    expect(wl.requests).toEqual(['screen', 'screen']);
  });

  it('does not request again while the lock is still live, or when unchecked', async () => {
    const wl = installWakeLock();
    const { f, toggle } = await mount();
    await toggle();
    setVisibility('visible');
    await settle(f);
    expect(wl.requests.length).toBe(1);
    await toggle();
    setVisibility('visible');
    await settle(f);
    expect(wl.requests.length).toBe(1);
  });

  it('releases on destroy and stops listening', async () => {
    const wl = installWakeLock();
    const { f, toggle } = await mount();
    await toggle();
    f.destroy();
    expect(wl.sentinels[0].releases).toBe(1);
    setVisibility('visible');
    expect(wl.requests.length).toBe(1);
  });
});
