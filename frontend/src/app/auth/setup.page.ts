import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiError, toApiError } from '../core/api-error';
import { AccountApi } from '../account/account.api';
import { AuthStore } from '../core/auth.store';
import { AccountFormComponent, AccountValues } from './account-form.component';

@Component({
  selector: 'app-setup-page',
  imports: [AccountFormComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('setup.title') }}</h1>
      <p class="intro">{{ t('setup.intro') }}</p>
      <div class="card">
        <app-account-form submitLabelKey="setup.submit" [busy]="busy()" [error]="error()"
          (submitted)="submit($event)" />
      </div>
    </ng-container>
  `,
})
export class SetupPage {
  private readonly api = inject(AccountApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async submit(v: AccountValues): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.auth.setMe(await this.api.setup(v));
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
