import { Injectable } from '@angular/core';

/**
 * Unsent work of open pages (the recipe editor's autosave), so that logging out can send it first,
 * while the session is still valid. Pages register a flush; work still running after a page went
 * away (its leaving flush) is tracked until it settles.
 */
@Injectable({ providedIn: 'root' })
export class PendingSaves {
  private readonly flushers = new Set<() => Promise<void>>();
  private readonly running = new Set<Promise<unknown>>();

  /** Registers a flush for `flushAll()`; returns the unregister function. */
  register(flush: () => Promise<void>): () => void {
    this.flushers.add(flush);
    return () => this.flushers.delete(flush);
  }

  /** Tracks work that is already running (e.g. the flush of an editor being destroyed). */
  track(work: Promise<unknown>): void {
    this.running.add(work);
    void work.finally(() => this.running.delete(work)).catch(() => {});
  }

  /** Runs every registered flush and waits for those and all tracked work; never rejects. */
  async flushAll(): Promise<void> {
    await Promise.allSettled([...[...this.flushers].map((f) => f()), ...this.running]);
  }
}
