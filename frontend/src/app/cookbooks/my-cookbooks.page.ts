import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { openEditorSheet } from '../recipes/editor/editor-sheet';
import { CookbookApi } from './cookbook.api';
import { CookbookInput, CookbookSummary } from './cookbook.model';
import { CookbookFormDialog } from './cookbook-form.dialog';

/** The user's cookbooks (owned and co-authored): a card grid on desktop, a list on the phone. */
@Component({
  selector: 'app-my-cookbooks-page',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ng-container *transloco="let t">
      <div class="head">
        <h1>{{ t('cookbooks.title') }}</h1>
        <button type="button" class="new" (click)="create()">{{ t('cookbooks.new') }}</button>
      </div>
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="retry" (click)="load()">{{ t('common.retry') }}</button>
      } @else if (books(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ t('cookbooks.empty') }}</p>
        } @else {
          <ul class="grid">
            @for (b of list; track b.id) {
              <li>
                <a class="cookbook" [routerLink]="['/cookbooks', b.id]">
                  <span class="name">{{ b.name }}</span>
                  <span class="count">{{ t(b.recipeCount === 1 ? 'cookbooks.recipeCountOne' : 'cookbooks.recipeCountOther', { count: b.recipeCount }) }}</span>
                  <span class="badges">
                    <span class="badge" [attr.data-badge]="b.role">{{ t(b.role === 'OWNER' ? 'cookbooks.roleOwner' : 'cookbooks.roleAuthor') }}</span>
                    <span class="badge" [attr.data-badge]="b.visibility">{{ t('cookbooks.visibility.' + b.visibility) }}</span>
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="loading" role="status">{{ t('cookbooks.loading') }}</p>
      }
    </ng-container>
  `,
})
export class MyCookbooksPage {
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);
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
      this.error.set(errorKey(toApiError(e)));
    }
  }

  protected async create(): Promise<void> {
    const created: { id: string | null } = { id: null };
    const ref = openEditorSheet(this.dialog, this.injector, CookbookFormDialog, {
      label: this.i18n.translate('cookbooks.newTitle'),
      data: { submit: async (input: CookbookInput) => (created.id = (await this.api.create(input)).id) },
    });
    if ((await firstValueFrom(ref.closed, { defaultValue: undefined })) === true && created.id) {
      await this.router.navigateByUrl(`/cookbooks/${created.id}`);
    }
  }
}
