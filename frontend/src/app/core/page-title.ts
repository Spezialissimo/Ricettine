import { Injectable, inject } from '@angular/core';
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
  private readonly i18n = inject(TranslocoService);
  private key: string | undefined;
  private dynamic: string | null = null;

  constructor() {
    super();
    // Not selectTranslate: it errors out (and stays dead) if the first load fails, which would leave
    // the title unset for the rest of the session. These streams survive a failed load and its retry.
    merge(
      this.i18n.langChanges$,
      this.i18n.events$.pipe(filter((e) => e.type === 'translationLoadSuccess')),
    ).subscribe(() => this.render());
    this.i18n.load(this.i18n.getActiveLang()).subscribe({ error: () => undefined }); // retried by the templates
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
