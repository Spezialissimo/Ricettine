import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * "Keep screen on" while cooking, through the Screen Wake Lock API. Not rendered where the API is missing.
 * The browser drops the lock when the tab is hidden, so it is requested again when the page is visible.
 */
@Component({
  selector: 'app-keep-screen-on',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; min-width: 44px; cursor: pointer; }
    input { width: 24px; height: 24px; margin: 0; }
  `,
  template: `
    @if (supported) {
      <label *transloco="let t">
        <input #box type="checkbox" [checked]="checked()" (change)="toggle($any($event.target).checked)" />
        {{ t('recipes.keepScreenOn') }}
      </label>
    }
  `,
})
export class KeepScreenOnComponent {
  private readonly doc = inject(DOCUMENT);
  protected readonly supported = 'wakeLock' in navigator;
  protected readonly checked = signal(false);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private sentinel: WakeLockSentinel | null = null;
  private readonly onVisible = () => {
    if (this.doc.visibilityState === 'visible' && this.checked() && (!this.sentinel || this.sentinel.released)) void this.acquire();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.checked.set(false);
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      void this.release();
    });
  }

  protected toggle(on: boolean): void {
    this.checked.set(on);
    if (on) {
      this.doc.addEventListener('visibilitychange', this.onVisible);
      void this.acquire();
    } else {
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      void this.release();
    }
  }

  private async acquire(): Promise<void> {
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.checked()) {
        void sentinel.release(); // unchecked or destroyed while the request was pending
        return;
      }
      sentinel.addEventListener('release', () => { if (this.sentinel === sentinel) this.sentinel = null; });
      this.sentinel = sentinel;
    } catch {
      // refused (battery saver, no permission): stay off, quietly
      this.sentinel = null;
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      this.checked.set(false);
      // the box was toggled natively and the binding may not have changed in between, so set it directly
      const box = this.box();
      if (box) box.nativeElement.checked = false;
    }
  }

  private async release(): Promise<void> {
    const s = this.sentinel;
    this.sentinel = null;
    try { await s?.release(); } catch { /* already released */ }
  }
}
