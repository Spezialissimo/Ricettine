import { Injectable } from '@angular/core';

/** Logout waits at most this long for open editors to save; the local backup keeps anything unsent. */
export const FLUSH_TIMEOUT_MS = 5000;

/**
 * Unsent work of open pages (the recipe editor's autosave), so that logging out can send it first,
 * while the session is still valid. Pages register a flush; work still running after a page went
 * away (its leaving flush) is tracked until it settles.
 */
@Injectable({ providedIn: 'root' })
export class PendingSaves {
  private readonly flushers = new Set<() => Promise<void>>();
  private readonly running = new Set<Promise<unknown>>();

  /** Registers a flush for `flushAll()` (it rejects if something stayed unsaved); returns the unregister function. */
  register(flush: () => Promise<void>): () => void {
    this.flushers.add(flush);
    return () => this.flushers.delete(flush);
  }

  /** Tracks work that is already running (e.g. the flush of an editor being destroyed; rejects if unsaved). */
  track(work: Promise<unknown>): void {
    this.running.add(work);
    void work.finally(() => this.running.delete(work)).catch(() => {});
  }

  /**
   * Runs every registered flush and waits for those and all tracked work, at most `timeoutMs`;
   * never rejects. Resolves true only if everything was saved in time ("clean"). A failed or hung
   * save does not hold logout up: the editor's local backup keeps the text, and the editor restores
   * it on the next visit.
   */
  async flushAll(timeoutMs = FLUSH_TIMEOUT_MS): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>(
      (resolve) => (timer = setTimeout(() => resolve(false), timeoutMs)),
    );
    const all = Promise.allSettled([...[...this.flushers].map((f) => f()), ...this.running]).then(
      (rs) => rs.every((r) => r.status === 'fulfilled'),
    );
    const clean = await Promise.race([all, timeout]);
    clearTimeout(timer);
    return clean;
  }
}
