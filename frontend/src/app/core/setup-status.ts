import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** GET /api/setup/status: whether first-run setup is open and which site this is (main or demo). */
export type SiteStatus = { setupRequired: boolean; demo: boolean; demoUrl: string | null };

const MAIN: SiteStatus = { setupRequired: false, demo: false, demoUrl: null };

/** Caches GET /api/setup/status once it reports setup is no longer required. */
@Injectable({ providedIn: 'root' })
export class SetupStatus {
  private readonly http = inject(HttpClient);
  private cached: SiteStatus | null = null;

  /** The full status. A failed check is not cached and reads as a main site that needs no setup. */
  async status(): Promise<SiteStatus> {
    if (this.cached) return this.cached;
    try {
      const s = await firstValueFrom(this.http.get<Partial<SiteStatus>>('/api/setup/status'));
      const status: SiteStatus = {
        setupRequired: !!s.setupRequired,
        demo: !!s.demo,
        demoUrl: s.demoUrl ?? null,
      };
      if (!status.setupRequired) this.cached = status;
      return status;
    } catch {
      return MAIN; // do not lock users out if the check itself fails; not cached
    }
  }

  async required(): Promise<boolean> {
    return (await this.status()).setupRequired;
  }

  /** Forget the cached answer (e.g. after the last user was deleted). */
  refresh(): void {
    this.cached = null;
  }
}
