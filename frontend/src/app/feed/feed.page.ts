import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKey, toApiError } from '../core/api-error';
import { mediaUrl } from '../core/media';
import { AppDatePipe } from '../shared/app-date.pipe';
import { FeedApi } from './feed.api';
import { FeedItem } from './feed.model';

@Component({
  selector: 'app-feed-page',
  imports: [RouterLink, TranslocoDirective, AppDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../recipes/recipes.scss', './feed.page.scss'],
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('feed.title') }}</h1>
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="retry" (click)="load()">{{ t('common.retry') }}</button>
      } @else if (items(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ t('feed.empty') }}</p>
          <a class="primary" routerLink="/recipes/new">{{ t('recipes.emptyAction') }}</a>
        } @else {
          <ul class="grid feed">
            @for (r of list; track r.id) {
              <li>
                <a class="recipe" [routerLink]="['/r', r.shareToken]">
                  @if (thumb(r); as src) {
                    <img class="thumb" [src]="src" [alt]="t('recipes.coverAlt', { title: r.title })" />
                  } @else {
                    <span class="thumb none" aria-hidden="true"></span>
                  }
                  <span class="body">
                    <span class="name">{{ r.title }}</span>
                    <span class="meta">{{ t('recipes.by', { name: r.author.displayName }) }}</span>
                    <span class="meta">{{ r.publishedAt | appDate }}</span>
                  </span>
                </a>
              </li>
            }
          </ul>
          @if (moreError(); as e) {
            <p class="alert" role="alert">{{ t(e) }}</p>
          }
          @if (nextCursor() || moreError()) {
            <button type="button" class="more" [disabled]="loadingMore()" (click)="more()">
              {{ moreError() ? t('common.retry') : t('feed.more') }}
            </button>
          }
        }
      } @else {
        <p class="loading" role="status">{{ t('feed.loading') }}</p>
      }
    </ng-container>
  `,
})
export class FeedPage {
  private readonly api = inject(FeedApi);
  protected readonly items = signal<FeedItem[] | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly moreError = signal<string | null>(null);
  protected readonly loadingMore = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      const page = await this.api.page();
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  async more(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moreError.set(null);
    try {
      const page = await this.api.page(cursor);
      this.items.update((list) => [...(list ?? []), ...page.items]);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      this.moreError.set(errorKey(toApiError(e)));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected thumb(r: FeedItem): string | null {
    return mediaUrl(r.coverThumbUrl);
  }
}
