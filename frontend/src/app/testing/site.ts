import { signal } from '@angular/core';
import { Site } from '../core/site';

/** Provides a fixed `Site` for a spec: `provideSite({ demo: true })` renders the demo variant of a component. */
export const provideSite = (
  o: { demo?: boolean; demoUrl?: string | null; mainUrl?: string | null } = {},
) => ({
  provide: Site,
  useValue: {
    demo: signal(o.demo ?? false),
    demoUrl: signal(o.demoUrl ?? null),
    mainUrl: o.mainUrl ?? null,
    load: async () => {},
  },
});
