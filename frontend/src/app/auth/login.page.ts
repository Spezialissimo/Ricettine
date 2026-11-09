import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiError, errorKey, toApiError } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { safeNext } from './safe-next';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  styles: `
    @use '../../styles/tokens' as t;
    .field {
      margin-bottom: t.$space-4;
    }
    label {
      display: block;
      font-weight: 600;
    }
    .error {
      display: block;
      color: #b3261e;
      font-weight: 400;
      font-size: 0.85rem;
      margin-top: t.$space-1;
    }
    input[aria-invalid='true'] {
      border-color: #b3261e;
    }
    input {
      @include t.touch-target;
      display: block;
      width: 100%;
      margin-top: t.$space-1;
      padding: 0 t.$space-3;
      font: inherit;
      border: 1px solid t.$border;
      border-radius: t.$radius;
      background: t.$surface;
      color: t.$ink;
    }
    .alert {
      color: #b3261e;
      margin: 0 0 t.$space-4;
    }
    button {
      @include t.touch-target;
      width: 100%;
      border: 0;
      border-radius: t.$radius;
      background: t.$accent;
      color: #fff;
      font-weight: 600;
    }
    button[disabled] {
      opacity: 0.6;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('common.appName') }}</h1>
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label>
            {{ t('auth.email') }}
            <input
              type="email"
              name="email"
              formControlName="email"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              inputmode="email"
              [attr.aria-invalid]="missing('email') ? 'true' : null"
              [attr.aria-describedby]="missing('email') ? 'err-email' : null"
            />
          </label>
          @if (missing('email')) {
            <span class="error" id="err-email">{{ t('auth.required') }}</span>
          }
        </div>
        <div class="field">
          <label>
            {{ t('auth.password') }}
            <input
              type="password"
              name="password"
              formControlName="password"
              autocomplete="current-password"
              [attr.aria-invalid]="missing('password') ? 'true' : null"
              [attr.aria-describedby]="missing('password') ? 'err-password' : null"
            />
          </label>
          @if (missing('password')) {
            <span class="error" id="err-password">{{ t('auth.required') }}</span>
          }
        </div>
        @if (attempted() && form.invalid) {
          <p class="alert" role="alert">{{ t('auth.fillBoth') }}</p>
        } @else if (error(); as e) {
          <p class="alert" role="alert">{{ t(key(e)) }}</p>
        }
        <button type="submit" [disabled]="busy()">{{ t('auth.login') }}</button>
      </form>
    </ng-container>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly attempted = signal(false);
  readonly key = errorKey;
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /** True once a submit was tried and the field is still empty (stays reactive to typing via the form value). */
  missing(name: 'email' | 'password'): boolean {
    return this.attempted() && this.form.controls[name].invalid;
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl(safeNext(this.route.snapshot.queryParamMap.get('next')));
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
