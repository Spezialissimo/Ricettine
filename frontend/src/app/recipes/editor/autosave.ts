import { Signal, computed, signal } from '@angular/core';
import { ApiError, toApiError } from '../../core/api-error';
import { Recipe, RecipeInput } from '../recipe.model';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_MAX_WAIT_MS = 5000;

export interface AutosaveDeps {
  /** Sends the working copy (PUT); resolves with the server's new RecipeDto. */
  save(input: RecipeInput): Promise<Recipe>;
  /** Reads the current working copy, including the version to send. */
  read(): RecipeInput;
  /** Called after each successful save; must adopt `r.version` without touching newer local edits. */
  saved(r: Recipe): void;
}

export interface AutosaveOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  /** Subscribes to "connection is back"; returns an unsubscribe. Defaults to `window` 'online'. */
  onOnline?: (cb: () => void) => () => void;
}

const windowOnline = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', cb);
  return () => window.removeEventListener('online', cb);
};

/**
 * Autosave timing per the Global Constraints: debounce after the last change, at most `maxWaitMs`
 * between saves while changes keep coming, one request in flight; changes made during a flight are
 * sent next with the version the server returned. A 409 blocks all saving until `reset()`.
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
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly unlistenOnline: () => void;

  constructor(private readonly deps: AutosaveDeps, options: AutosaveOptions = {}) {
    this.debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
    this.unlistenOnline = (options.onOnline ?? windowOnline)(() => {
      if (this._status() === 'offline' && this.dirty()) this.trigger();
    });
  }

  /** Records a local change and schedules a save. */
  changed(): void {
    if (this.disposed) return;
    this.rev.update((r) => r + 1);
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
    this.debounceTimer = this.maxTimer = null;
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

  private async send(): Promise<void> {
    const sentRev = this.rev();
    this._status.set('saving');
    try {
      const saved = await this.deps.save(this.deps.read());
      if (this.disposed) return;
      this.deps.saved(saved);
      this.savedRev.set(sentRev);
      this._error.set(null);
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
      } else if (err.code === 'network_error') {
        this._status.set('offline');
      } else {
        this._status.set('error');
      }
    }
  }
}
