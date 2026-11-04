import { TestBed } from '@angular/core/testing';
import { FLUSH_TIMEOUT_MS, PendingSaves } from './pending-saves';

describe('PendingSaves', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushAll gives up after the timeout so a hung save cannot block logout', async () => {
    const pending = TestBed.inject(PendingSaves);
    pending.register(() => new Promise<void>(() => {})); // never answers
    let result: boolean | undefined;
    void pending.flushAll().then((r) => (result = r));
    expect(FLUSH_TIMEOUT_MS).toBe(5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false); // timed out: not clean
  });

  it('flushAll resolves as soon as every flush settled, even a failed one', async () => {
    const pending = TestBed.inject(PendingSaves);
    pending.register(() => Promise.reject(new Error('offline')));
    pending.register(() => Promise.resolve());
    await expect(pending.flushAll()).resolves.toBe(false); // one failed: not clean
  });

  it('flushAll reports clean when every flush and tracked work succeeded', async () => {
    const pending = TestBed.inject(PendingSaves);
    pending.register(() => Promise.resolve());
    pending.track(Promise.resolve());
    await expect(pending.flushAll()).resolves.toBe(true);
  });
});
