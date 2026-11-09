import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiError, toApiError } from '../core/api-error';
import { AccountApi } from '../account/account.api';
import { AuthStore } from '../core/auth.store';
import { AccountFormComponent, AccountValues } from './account-form.component';

@Component({
  selector: 'app-register-page',
  imports: [AccountFormComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('invite.title') }}</h1>
      @switch (state()) {
        @case ('checking') { <p class="intro">{{ t('invite.checking') }}</p> }
        @case ('invalid') { <p class="card" role="alert">{{ t('errors.invite_invalid') }}</p> }
        @default {
          <p class="intro">{{ t('invite.intro') }}</p>
          <div class="card">
            <app-account-form submitLabelKey="auth.register" [busy]="busy()" [error]="error()"
              (submitted)="submit($event)" />
          </div>
        }
      }
    </ng-container>
  `,
})
export class RegisterPage implements OnInit {
  private readonly api = inject(AccountApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  readonly state = signal<'checking' | 'valid' | 'invalid'>('checking');
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.api.checkInvite(this.token);
      this.state.set('valid');
    } catch (e) {
      // Only a definite 404 means the link is dead; other failures keep the form so the
      // submit surfaces the real error.
      this.state.set(toApiError(e).status === 404 ? 'invalid' : 'valid');
    }
  }

  async submit(v: AccountValues): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.auth.setMe(await this.api.register(this.token, v));
      await this.router.navigateByUrl('/');
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'invite_invalid') this.state.set('invalid');
      else this.error.set(err);
    } finally {
      this.busy.set(false);
    }
  }
}
