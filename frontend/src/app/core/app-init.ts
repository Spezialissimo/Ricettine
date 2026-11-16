import { inject } from '@angular/core';
import { AuthStore } from './auth.store';
import { Site } from './site';

/**
 * The app initializer: which site this is first (on the demo, `Site.load` signs in silently, so deep links land on
 * their page and the guards, which run after the initializers, already see a user), then the current user.
 * Both services are injected before the first await: `inject()` only works while the initializer starts.
 */
export function initSiteAndAuth(): Promise<void> {
  const site = inject(Site);
  const auth = inject(AuthStore);
  return (async () => {
    await site.load();
    await auth.load();
  })();
}
