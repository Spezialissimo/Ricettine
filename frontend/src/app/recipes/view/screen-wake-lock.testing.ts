/** Test support: a fake Screen Wake Lock API. */
export class FakeSentinel extends EventTarget {
  released = false;
  releases = 0;
  async release() {
    this.released = true;
    this.releases++;
    this.dispatchEvent(new Event('release'));
  }
}

/** Installs a fake Screen Wake Lock API; `reject` makes every request fail like a refusal. */
export function installWakeLock(reject = false) {
  const state = { requests: [] as string[], sentinels: [] as FakeSentinel[] };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async (type: string) => {
        state.requests.push(type);
        if (reject) throw new DOMException('no', 'NotAllowedError');
        const s = new FakeSentinel();
        state.sentinels.push(s);
        return s;
      },
    },
  });
  return state;
}

export const removeWakeLock = () =>
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
