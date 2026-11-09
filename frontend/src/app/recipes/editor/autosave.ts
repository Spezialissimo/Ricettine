import { Signal, computed, signal } from '@angular/core';
import { ApiError, toApiError } from '../../core/api-error';
import { Recipe, RecipeInput } from '../recipe.model';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';

const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTOSAVE_MAX_WAIT_MS = 5000;
/** Waits before retrying a save that failed for a transient reason; the last one repeats. */
const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 15_000, 30_000];

export interface AutosaveDeps {
  /** Sends the working copy (PUT); resolves with the server's new RecipeDto. */
  save(input: RecipeInput): Promise<Recipe>;
  /** Reads the current working copy, including the version to send. */
  read(): RecipeInput;
  /** Called after each successful save; must adopt `r.version` without touching newer local edits. */
  saved(r: Recipe): void;
  /**
   * The local copy of unsent text: `write()` runs synchronously on every change (before anything is
   * sent), after a save that left newer changes pending (re-based on the new version) and on entering
   * a conflict; `clear()` once the server confirmed a save that includes the newest change.
   */
  backup?: { write(): void; clear(): void };
}

export interface AutosaveOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  /** Subscribes to "connection is back"; returns an unsubscribe. Defaults to `window` 'online'. */
  onOnline?: (cb: () => void) => () => void;
  /** Subscribes to "the page is visible again"; returns an unsubscribe. Defaults to document 'visibilitychange'. */
  onVisible?: (cb: () => void) => () => void;
  retryDelaysMs?: readonly number[];
}

const windowOnline = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', cb);
  return () => window.removeEventListener('online', cb);
};

const documentVisible = (cb: () => void) => {
  if (typeof document === 'undefined') return () => {};
  const h = () => {
    if (document.visibilityState === 'visible') cb();
  };
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
};

/** Worth trying again by itself: no connection (status 0), a server error or 503 busy. */
const transient = (e: ApiError) => e.status === 0 || e.status >= 500;

/**
 * Autosave timing per the Global Constraints: debounce after the last change, at most `maxWaitMs`
 * between saves while changes keep coming, one request in flight; changes made during a flight are
 * sent next with the version the server returned. A 409 blocks all saving until `reset()`.
 * A transient failure (offline, 5xx, 503 busy) is retried after 2 s, 5 s, 15 s, then every 30 s, and
 * at once when the browser goes online or the page becomes visible again.
 *
 * Plain class (no DI) so it can be driven with fake timers. Signals are its only output.
 */
export class Autosave {
  private readonly _status = signal<SaveStatus>('idle');
  private readonly _error = signal<ApiError | null>(null);
  private readonly rev = signal(0); // bumped on every change
  private readonly savedRev = signal(0); // last revision the server confirmed

  readonly status: Signal<SaveStatus> = this._status.asReadonly();
  /** The last save failure (code + `fields`), or null after a successful save. */
  readonly error: Signal<ApiError | null> = this._error.asReadonly();
  /** True while there are local changes the server has not confirmed. */
  readonly dirty = computed(() => this.rev() !== this.savedRev());

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private sendAgain = false;
  private disposed = false;
  private suspended = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private failedTransiently = false;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retryDelays: readonly number[];
  private readonly unlistenOnline: () => void;
  private readonly unlistenVisible: () => void;

  constructor(
    private readonly deps: AutosaveDeps,
    options: AutosaveOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
    this.retryDelays = options.retryDelaysMs ?? AUTOSAVE_RETRY_DELAYS_MS;
    const retryNow = () => {
      if (this.failedTransiently && this.dirty()) this.trigger();
    };
    this.unlistenOnline = (options.onOnline ?? windowOnline)(retryNow);
    this.unlistenVisible = (options.onVisible ?? documentVisible)(retryNow);
  }

  /** Records a local change and schedules a save. */
  changed(): void {
    if (this.disposed) return;
    this.rev.update((r) => r + 1);
    this.deps.backup?.write(); // first, synchronously: survives a tab close a moment later
    if (this._status() === 'saved') this._status.set('idle');
    this.schedule();
  }

  /** Sends pending changes now and resolves once the server answered (check `status`/`dirty`). */
  async flush(): Promise<void> {
    this.clearTimers();
    for (;;) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }
      if (this.blocked() || !this.dirty()) return;
      this.trigger();
      await this.inFlight;
      const s = this._status();
      if (s === 'error' || s === 'offline' || s === 'conflict') return;
    }
  }

  /** Forgets pending changes and any conflict/error (after the working copy was replaced from the server). */
  reset(): void {
    this.clearTimers();
    this.sendAgain = false;
    this.retries = 0;
    this.failedTransiently = false;
    this.savedRev.set(this.rev());
    this._error.set(null);
    this._status.set('idle');
  }

  /** Waits for a request already in flight (without sending anything new). */
  async settled(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /** Holds all saving (e.g. while the recipe is being deleted); `resume()` picks pending changes up again. */
  suspend(): void {
    this.suspended = true;
    this.clearTimers();
    this.sendAgain = false;
  }

  resume(): void {
    this.suspended = false;
    if (this.dirty()) this.schedule();
  }

  /** Stops for good: no timers, no online listener, nothing more is sent. */
  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.sendAgain = false;
    this.unlistenOnline();
    this.unlistenVisible();
  }

  private blocked(): boolean {
    return this.disposed || this.suspended || this._status() === 'conflict';
  }

  private schedule(): void {
    if (this.blocked()) return; // after a conflict nothing more is sent until reset()
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.trigger(), this.debounceMs);
    this.maxTimer ??= setTimeout(() => this.trigger(), this.maxWaitMs);
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = this.maxTimer = this.retryTimer = null;
  }

  private trigger(): void {
    if (this.blocked()) return;
    if (this.inFlight) {
      this.sendAgain = true;
      return;
    }
    this.clearTimers();
    if (!this.dirty()) return;
    this.inFlight = this.send().finally(() => {
      this.inFlight = null;
      if (this.sendAgain) {
        this.sendAgain = false;
        if (this.dirty()) this.trigger();
      }
    });
  }

  /** A 409 learned elsewhere (e.g. from publish): block saving like a failed save would. */
  markConflict(err: ApiError): void {
    this.clearTimers();
    this._error.set(err);
    this._status.set('conflict');
    this.deps.backup?.write(); // the conflict's text now lives only here and in the backup
  }

  private scheduleRetry(): void {
    if (this.blocked()) return;
    const delay = this.retryDelays[Math.min(this.retries, this.retryDelays.length - 1)];
    this.retries++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.dirty()) this.trigger();
    }, delay);
  }

  private async send(): Promise<void> {
    const sentRev = this.rev();
    this._status.set('saving');
    try {
      const saved = await this.deps.save(this.deps.read());
      if (this.disposed) return;
      this.deps.saved(saved);
      this.savedRev.set(sentRev);
      this._error.set(null);
      this.retries = 0;
      this.failedTransiently = false;
      if (this.dirty())
        this.deps.backup?.write(); // newer text still pending: keep it, on the new version
      else this.deps.backup?.clear();
      if (this.dirty()) {
        // Newer edits are waiting: send them right away if a timer already fired during the flight.
        this._status.set(this.sendAgain ? 'saving' : 'idle');
      } else {
        this._status.set('saved');
      }
    } catch (e) {
      if (this.disposed) return;
      const err = toApiError(e);
      this._error.set(err);
      if (err.status === 409 || err.code === 'recipe_conflict') {
        this.clearTimers();
        this._status.set('conflict');
        this.deps.backup?.write(); // the conflict's text now lives only here and in the backup
      } else {
        this._status.set(err.code === 'network_error' ? 'offline' : 'error');
        this.failedTransiently = transient(err);
        if (this.failedTransiently) this.scheduleRetry();
      }
    }
  }
}
