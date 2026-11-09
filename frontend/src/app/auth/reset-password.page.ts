import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AccountApi } from '../account/account.api';
import { ApiError, toApiError } from '../core/api-error';
import { AccountFormComponent, AccountValues } from './account-form.component';

@Component({
  selector: 'app-reset-password-page',
  imports: [AccountFormComponent, TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('reset.title') }}</h1>
      @if (done()) {
        <p class="card">{{ t('reset.done') }}</p>
        <a class="btn-link" routerLink="/login">{{ t('reset.goToLogin') }}</a>
      } @else {
        <div class="card">
          <app-account-form
            mode="password"
            submitLabelKey="reset.submit"
            [busy]="busy()"
            [error]="error()"
            (submitted)="submit($event)"
          />
        </div>
      }
    </ng-container>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(AccountApi);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  readonly done = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async submit(v: AccountValues): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.resetPassword(this.token, v.password);
      this.done.set(true);
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
