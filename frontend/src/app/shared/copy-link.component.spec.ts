import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CopyLinkComponent } from './copy-link.component';
import { en, provideTestTransloco, settle } from '../testing/transloco';

@Component({
  imports: [CopyLinkComponent],
  template: `<app-copy-link url="https://x/invite/abc" expiresAt="2030-01-01T00:00:00Z" />`,
})
class Host {}

describe('CopyLinkComponent', () => {
  const nav = navigator as unknown as Record<string, unknown>;
  const clip = (writeText: unknown) =>
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  afterEach(() => {
    delete nav['share'];
    delete nav['clipboard'];
    vi.restoreAllMocks();
  });

  async function mount() {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    const f = TestBed.createComponent(Host);
    await settle(f);
    return f;
  }
  const btn = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

  it('shows the url and copies it with a confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clip(writeText);
    const f = await mount();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('https://x/invite/abc');
    btn(el, en.common.copy)!.click();
    await settle(f);
    expect(writeText).toHaveBeenCalledWith('https://x/invite/abc');
    expect(el.textContent).toContain(en.common.copied);
  });

  it('does not throw when the clipboard rejects', async () => {
    clip(vi.fn().mockRejectedValue(new Error('denied')));
    const f = await mount();
    const el = f.nativeElement as HTMLElement;
    btn(el, en.common.copy)!.click();
    await settle(f);
    expect(el.textContent).not.toContain(en.common.copied);
  });

  it('hides Share without navigator.share and shows it with', async () => {
    let f = await mount();
    expect(btn(f.nativeElement, en.common.share)).toBeUndefined();
    TestBed.resetTestingModule();
    const share = vi.fn().mockRejectedValue(new Error('cancelled'));
    nav['share'] = share;
    f = await mount();
    const b = btn(f.nativeElement, en.common.share)!;
    expect(b).toBeTruthy();
    b.click();
    await settle(f);
    expect(share).toHaveBeenCalled();
  });
});
