import { Injectable, Injector, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter, merge } from 'rxjs';

/**
 * Sets the document title as "{page} · Ricettine" (or "Ricettine" without a page). A route's
 * `title` is an i18n key; dynamic pages override it through PageTitle until the next navigation.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly doc = inject(Title);
  private readonly injector = inject(Injector);
  private i18nService: TranslocoService | undefined;
  private key: string | undefined;
  private dynamic: string | null = null;

  /**
   * Resolved on first use, never in the constructor: the Router builds this strategy while it is itself
   * being constructed, and TranslocoService loads over HttpClient, whose authInterceptor injects the
   * Router (NG0200, a circular dependency, on every first translation load).
   */
  private get i18n(): TranslocoService {
    if (!this.i18nService) {
      const i18n = (this.i18nService = this.injector.get(TranslocoService));
      // survives a failed load: these streams (unlike selectTranslate) do not error out
      merge(
        i18n.langChanges$,
        i18n.events$.pipe(filter((e) => e.type === 'translationLoadSuccess')),
      ).subscribe(() => this.render());
      i18n
        .load(i18n.getActiveLang())
        .subscribe({ error: (e) => console.error('Translations failed to load', e) });
    }
    return this.i18nService;
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.dynamic = null;
    this.render();
  }

  setDynamic(text: string | null): void {
    this.dynamic = text;
    this.render();
  }

  private render(): void {
    if (Object.keys(this.i18n.getTranslation(this.i18n.getActiveLang()) ?? {}).length === 0) return; // not loaded yet
    const app = this.i18n.translate('common.appName');
    const page = this.dynamic ?? (this.key ? this.i18n.translate(this.key) : null);
    this.doc.setTitle(page ? `${page} · ${app}` : app);
  }
}

/** Dynamic page titles (recipe and cookbook names): overrides the route title until the next navigation. */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly strategy = inject(AppTitleStrategy);

  set(text: string | null): void {
    this.strategy.setDynamic(text);
  }
}
