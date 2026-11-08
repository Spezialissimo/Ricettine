import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { CookbookApi } from './cookbook.api';
import { CookbookInvitePreview } from './cookbook.model';

/** A co-author invite: who invited you to which cookbook, with Accept and Not now. Needs a session. */
@Component({
  selector: 'app-accept-invite-page',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ng-container *transloco="let t">
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <a class="btn" routerLink="/cookbooks">{{ t('cookbooks.title') }}</a>
      } @else if (preview(); as p) {
        <h1>{{ t('cookbooks.acceptTitle') }}</h1>
        <p class="desc">
          {{
            t('cookbooks.acceptBody', {
              name: p.cookbookName,
              owner: p.owner?.displayName ?? t('cookbooks.deletedUser'),
            })
          }}
        </p>
        <div class="actions">
          <button type="button" class="new" [disabled]="busy()" (click)="accept()">
            {{ t('cookbooks.accept') }}
          </button>
          <a class="btn" routerLink="/cookbooks">{{ t('cookbooks.notNow') }}</a>
        </div>
      } @else {
        <p class="loading" role="status">{{ t('cookbooks.loading') }}</p>
      }
    </ng-container>
  `,
})
export class AcceptInvitePage {
  private readonly api = inject(CookbookApi);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  protected readonly preview = signal<CookbookInvitePreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.preview.set(await this.api.previewInvite(this.token));
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }

  protected async accept(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const book = await this.api.acceptInvite(this.token);
      await this.router.navigateByUrl(`/cookbooks/${book.id}`);
    } catch (e) {
      this.error.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }
}
