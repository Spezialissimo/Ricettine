import { TestBed } from '@angular/core/testing';
import { FLUSH_TIMEOUT_MS, PendingSaves } from './pending-saves';

describe('PendingSaves', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushAll gives up after the timeout so a hung save cannot block logout', async () => {
    const pending = TestBed.inject(PendingSaves);
    pending.register(() => new Promise<void>(() => {})); // never answers
    let done = false;
    void pending.flushAll().then(() => (done = true));
    expect(FLUSH_TIMEOUT_MS).toBe(5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('flushAll resolves as soon as every flush settled, even a failed one', async () => {
    const pending = TestBed.inject(PendingSaves);
    pending.register(() => Promise.reject(new Error('offline')));
    pending.register(() => Promise.resolve());
    await expect(pending.flushAll()).resolves.toBeUndefined();
  });
});
