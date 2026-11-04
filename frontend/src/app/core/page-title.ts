import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

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
  private ready = false;

  constructor() {
    super();
    // emits once translations are loaded, and again when the language or translations change
    this.i18n.selectTranslate('common.appName').subscribe(() => {
      this.ready = true;
      this.render();
    });
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
    if (!this.ready) return;
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
