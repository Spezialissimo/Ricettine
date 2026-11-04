import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKey, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { mediaUrl } from '../../core/media';
import { CookbookApi } from '../cookbook.api';
import { PublicCookbook } from '../cookbook.model';

/**
 * The cookbook page at /c/:token: readable without an account, with its own minimal header.
 * Desktop: card grid; phone: list. Members get a link to the cookbook in their account.
 */
@Component({
  selector: 'app-cookbook-view-page',
  imports: [TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbook-view.page.scss',
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <div class="bar">
          <a class="logo" routerLink="/">{{ t('common.appName') }}</a>
          <span class="spacer"></span>
          @if (auth.me()) {
            <a class="btn" routerLink="/recipes">{{ t('nav.recipes') }}</a>
          } @else {
            <a class="btn primary" routerLink="/login" [queryParams]="{ next: '/c/' + token }">{{ t('auth.login') }}</a>
          }
        </div>
      </header>
      <main>
        @if (notFound()) {
          <div class="state">
            <h1>{{ t('cookbooks.notFound') }}</h1>
            <p>{{ t('cookbooks.notFoundBody') }}</p>
            <a class="btn primary" routerLink="/">{{ t('cookbooks.home') }}</a>
          </div>
        } @else if (error(); as e) {
          <div class="state">
            <p class="alert" role="alert">{{ t(e) }}</p>
            <button type="button" class="btn primary" (click)="load()">{{ t('common.retry') }}</button>
          </div>
        } @else if (book(); as b) {
          @if (cover(b); as src) {
            <img class="cover" [src]="src" alt="" loading="eager" fetchpriority="high" />
          }
          <h1>{{ b.name }}</h1>
          @if (b.description) { <p class="desc">{{ b.description }}</p> }
          <p class="people">{{ t('cookbooks.by', { names: people(b) }) }}</p>
          @if (b.cookbookId) {
            <a class="btn mine" [routerLink]="['/cookbooks', b.cookbookId]">{{ t('cookbooks.openMine') }}</a>
          }
          <h2>{{ t('cookbooks.recipesHeading') }}</h2>
          @if (b.recipes.length === 0) {
            <p class="empty">{{ t('cookbooks.noRecipes') }}</p>
          } @else {
            <ul class="cards" role="list">
              @for (r of b.recipes; track r.recipeId) {
                <li class="card">
                  <a [routerLink]="['/c', token, 'r', r.recipeId]">
                    @if (thumb(r.coverThumbUrl); as src) { <img class="thumb" [src]="src" alt="" loading="lazy" /> }
                    <span class="body">
                      <span class="title">{{ r.title }}</span>
                      <span class="meta">{{ t('recipes.by', { name: r.author?.displayName ?? t('cookbooks.deletedUser') }) }}</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        } @else {
          <p class="loading" role="status">{{ t('common.loading') }}</p>
        }
      </main>
    </ng-container>
  `,
})
export class CookbookViewPage {
  private readonly api = inject(CookbookApi);
  private readonly title = inject(Title);
  protected readonly auth = inject(AuthStore);
  protected readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  protected readonly book = signal<PublicCookbook | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const previous = this.title.getTitle();
    inject(DestroyRef).onDestroy(() => this.title.setTitle(previous));
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    this.notFound.set(false);
    try {
      const b = await this.api.byToken(this.token);
      this.book.set(b);
      this.title.setTitle(b.name);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 404) this.notFound.set(true);
      else this.error.set(errorKey(err));
    }
  }

  protected people(b: PublicCookbook): string {
    return [b.owner, ...b.authors].filter((p) => p !== null).map((p) => p.displayName).join(', ');
  }
  protected cover(b: PublicCookbook): string | null {
    return mediaUrl(b.cover?.displayUrl);
  }
  protected thumb(url: string | null): string | null {
    return mediaUrl(url);
  }
}
