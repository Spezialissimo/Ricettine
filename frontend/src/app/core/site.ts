import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { SetupStatus } from './setup-status';

/**
 * The main site's address, derived from the demo host by dropping its leading `demo.` label
 * (demo.ricettine.food -> https://ricettine.food). Null when the host has no such label.
 */
export function mainSiteUrl(loc: Pick<Location, 'protocol' | 'hostname' | 'port'>): string | null {
  if (!loc.hostname.startsWith('demo.')) return null;
  const host = loc.hostname.slice('demo.'.length);
  return `${loc.protocol}//${host}${loc.port ? `:${loc.port}` : ''}`;
}

/**
 * Which site this is, from GET /api/setup/status (shared with SetupStatus, so it is one request).
 * `demo` is true on the read-only demo site; `demoUrl` is set on the main site when a demo exists.
 */
@Injectable({ providedIn: 'root' })
export class Site {
  // resolved lazily so that specs which never call load() need no HttpClient
  private readonly injector = inject(Injector);
  private readonly _demo = signal(false);
  private readonly _demoUrl = signal<string | null>(null);

  readonly demo = this._demo.asReadonly();
  readonly demoUrl = this._demoUrl.asReadonly();
  /** Where the demo banner links to; null if it cannot be derived from this host. */
  readonly mainUrl = mainSiteUrl(inject(DOCUMENT).location);

  async load(): Promise<void> {
    const s = await this.injector.get(SetupStatus).status();
    this._demo.set(s.demo);
    this._demoUrl.set(s.demoUrl);
  }
}
