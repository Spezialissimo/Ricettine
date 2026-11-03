import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../core/api-error';
import { AuthStore, Me } from '../core/auth.store';
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
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async submit(v: AccountValues): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const me = await firstValueFrom(
        this.http.post<Me>('/api/setup/admin', { ...v, email: v.email.trim() }),
      );
      this.auth.setMe(me);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
