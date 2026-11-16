import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * "Keep screen on" while cooking, through the Screen Wake Lock API. Provided by the recipe page, so the
 * desktop checkbox and the phone's ⋯ menu item share one state, and the lock goes when the page goes.
 * The browser drops the lock when the tab is hidden, so it is requested again when the page is visible.
 */
@Injectable()
export class ScreenWakeLock {
  private readonly doc = inject(DOCUMENT);
  readonly supported = 'wakeLock' in navigator;
  private readonly _on = signal(false);
  readonly on = this._on.asReadonly();
  private sentinel: WakeLockSentinel | null = null;
  private readonly onVisible = () => {
    if (
      this.doc.visibilityState === 'visible' &&
      this._on() &&
      (!this.sentinel || this.sentinel.released)
    )
      void this.acquire();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this._on.set(false);
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      void this.release();
    });
  }

  toggle(on: boolean): void {
    this._on.set(on);
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
      if (!this._on()) {
        void sentinel.release(); // switched off or destroyed while the request was pending
        return;
      }
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
      this.sentinel = sentinel;
    } catch {
      // refused (battery saver, no permission): stay off, quietly
      this.sentinel = null;
      this.doc.removeEventListener('visibilitychange', this.onVisible);
      this._on.set(false);
    }
  }

  private async release(): Promise<void> {
    const s = this.sentinel;
    this.sentinel = null;
    try {
      await s?.release();
    } catch {
      /* already released */
    }
  }
}
