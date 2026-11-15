import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { CookbookApi } from './cookbook.api';
import { CookbookSummary } from './cookbook.model';
import { CookbookCardsComponent } from './cookbook-cards.component';
import { NewCookbookFlow } from './new-cookbook';

/** The Cookbooks tab of My kitchen: the user's cookbooks, owned and co-authored, newest edit first. */
@Component({
  selector: 'app-my-cookbooks-page',
  imports: [TranslocoDirective, CookbookCardsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ng-container *transloco="let t">
      <h2 class="visually-hidden">{{ t('kitchen.cookbooks') }}</h2>
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="btn-primary retry" (click)="load()">
          {{ t('common.retry') }}
        </button>
      } @else if (books(); as list) {
        @if (list.length === 0) {
          <div class="empty-state">
            <p>{{ t('cookbooks.empty') }}</p>
            <button type="button" class="btn-primary new" (click)="create()">
              {{ t('cookbooks.emptyAction') }}
            </button>
          </div>
        } @else {
          <div class="head">
            <button type="button" class="btn-primary new" (click)="create()">
              {{ t('cookbooks.new') }}
            </button>
          </div>
          <app-cookbook-cards [cookbooks]="list" />
        }
      } @else {
        <p class="loading" role="status">{{ t('cookbooks.loading') }}</p>
      }
    </ng-container>
  `,
})
export class MyCookbooksPage {
  private readonly api = inject(CookbookApi);
  private readonly newCookbook = inject(NewCookbookFlow);
  protected readonly books = signal<CookbookSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.books.set(await this.api.mine());
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }

  protected create(): Promise<void> {
    return this.newCookbook.start();
  }
}
