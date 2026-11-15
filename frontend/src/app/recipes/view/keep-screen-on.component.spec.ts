import { TestBed } from '@angular/core/testing';
import { provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { KeepScreenOnComponent } from './keep-screen-on.component';
import { ScreenWakeLock } from './screen-wake-lock';
import { installWakeLock, removeWakeLock } from './screen-wake-lock.testing';

/** The checkbox only: the lock itself is ScreenWakeLock's (see its spec). */
async function mount() {
  TestBed.configureTestingModule({ providers: [provideTestTransloco(), ScreenWakeLock] });
  const f = TestBed.createComponent(KeepScreenOnComponent);
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  const box = () => el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  return { f, el, box, wake: TestBed.inject(ScreenWakeLock) };
}

describe('KeepScreenOnComponent', () => {
  afterEach(removeWakeLock);

  it('renders nothing when the Wake Lock API is absent', async () => {
    removeWakeLock();
    const { box, el } = await mount();
    expect(box()).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('is a labelled checkbox that switches the shared lock and follows it', async () => {
    const wl = installWakeLock();
    const { f, el, box, wake } = await mount();
    expect(el.textContent).toContain('Keep screen on');
    box()!.click();
    await settle(f);
    expect(wake.on()).toBe(true);
    expect(wl.requests).toEqual(['screen']);
    wake.toggle(false); // switched off elsewhere (the phone's ⋯ menu)
    await settle(f);
    expect(box()!.checked).toBe(false);
  });

  it('unticks itself when the lock is refused', async () => {
    installWakeLock(true);
    const { f, box } = await mount();
    box()!.click();
    await settle(f);
    expect(box()!.checked).toBe(false);
  });
});
