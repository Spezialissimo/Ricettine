import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiError, errorKey } from '../core/api-error';

export type AccountValues = { email: string; username: string; displayName: string; password: string };

const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'media', 'r', 'c', 'setup', 'login', 'logout', 'register', 'reset', 'settings',
  'invite', 'me', 'new',
]);

export const reservedUsername: ValidatorFn = (c) => (RESERVED_USERNAMES.has(c.value) ? { reserved: true } : null);
export const notBlank: ValidatorFn = (c) => (String(c.value ?? '').trim() ? null : { required: true });
export const maxTrimmed =
  (n: number): ValidatorFn =>
  (c) => (String(c.value ?? '').trim().length > n ? { maxlength: true } : null);

export const USERNAME_VALIDATORS: ValidatorFn[] = [
  Validators.required, Validators.pattern(/^[a-z0-9_]{3,30}$/), reservedUsername,
];
export const DISPLAY_NAME_VALIDATORS: ValidatorFn[] = [notBlank, maxTrimmed(80)];
export const PASSWORD_VALIDATORS: ValidatorFn[] = [
  Validators.required, Validators.minLength(10), Validators.maxLength(128),
];

const FIELD_OF_CODE: Record<string, 'email' | 'username' | 'password'> = {
  email_taken: 'email',
  invalid_email: 'email',
  username_taken: 'username',
  invalid_username: 'username',
  username_reserved: 'username',
  password_too_short: 'password',
  password_too_long: 'password',
};

/** Shared account fields. `mode="password"` shows only the (new) password field. */
@Component({
  selector: 'app-account-form',
  imports: [ReactiveFormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../styles/tokens' as t;
    label { display: block; margin-bottom: t.$space-4; font-weight: 600; }
    input { @include t.touch-target; display: block; width: 100%; margin-top: t.$space-1; padding: 0 t.$space-3;
      font: inherit; border: 1px solid t.$border; border-radius: t.$radius; background: t.$surface; color: t.$ink; }
    input.invalid { border-color: #b3261e; }
    .hint { display: block; font-weight: 400; font-size: 0.8rem; color: t.$muted; }
    .error { display: block; color: #b3261e; font-weight: 400; font-size: 0.85rem; margin-top: t.$space-1; }
    .alert { color: #b3261e; margin: 0 0 t.$space-4; }
    button { @include t.touch-target; width: 100%; border: 0; border-radius: t.$radius; background: t.$accent;
      color: #fff; font-weight: 600; padding: 0 t.$space-4; }
    button[disabled] { opacity: 0.6; }
  `,
  template: `
    <form *transloco="let t" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
      @if (mode() === 'full') {
        <label>
          {{ t('auth.email') }}
          <input type="email" name="email" formControlName="email" autocomplete="username"
            autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email"
            [class.invalid]="!!fieldError('email')" />
          @if (fieldError('email'); as e) { <span class="error" data-error="email">{{ t(e) }}</span> }
        </label>
        <label>
          {{ t('auth.username') }}
          <input type="text" name="username" formControlName="username" autocomplete="off"
            autocapitalize="none" autocorrect="off" spellcheck="false"
            [class.invalid]="!!fieldError('username')" />
          <span class="hint">{{ t('auth.usernameHint') }}</span>
          @if (fieldError('username'); as e) { <span class="error" data-error="username">{{ t(e) }}</span> }
        </label>
        <label>
          {{ t('auth.displayName') }}
          <input type="text" name="displayName" formControlName="displayName" autocomplete="name"
            [class.invalid]="!!fieldError('displayName')" />
          @if (fieldError('displayName'); as e) { <span class="error" data-error="displayName">{{ t(e) }}</span> }
        </label>
      }
      <label>
        {{ mode() === 'full' ? t('auth.password') : t('auth.newPassword') }}
        <input type="password" name="password" formControlName="password" autocomplete="new-password"
          [class.invalid]="!!fieldError('password')" />
        <span class="hint">{{ t('auth.passwordHint') }}</span>
        @if (fieldError('password'); as e) { <span class="error" data-error="password">{{ t(e) }}</span> }
      </label>
      @if (generalError(); as key) {
        <p class="alert" role="alert">{{ t(key) }}</p>
      }
      <button type="submit" [disabled]="busy()">{{ t(submitLabelKey()) }}</button>
    </form>
  `,
})
export class AccountFormComponent {
  readonly mode = input<'full' | 'password'>('full');
  readonly submitLabelKey = input.required<string>();
  readonly busy = input(false);
  readonly error = input<ApiError | null>(null);
  readonly submitted = output<AccountValues>();
  private attempted = false;

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    username: new FormControl('', {
      nonNullable: true,
      validators: USERNAME_VALIDATORS,
    }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: DISPLAY_NAME_VALIDATORS,
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: PASSWORD_VALIDATORS,
    }),
  });

  private readonly serverField = computed(() => {
    const e = this.error();
    return e ? (FIELD_OF_CODE[e.code] ?? null) : null;
  });

  readonly generalError = computed(() => {
    const e = this.error();
    if (!e) return null;
    const f = this.serverField();
    // In password-only mode a password error still belongs under the field.
    return f && (this.mode() === 'full' || f === 'password') ? null : errorKey(e);
  });

  fieldError(name: 'email' | 'username' | 'displayName' | 'password'): string | null {
    const c = this.form.controls[name];
    if (c.invalid && (c.dirty || c.touched || this.attempted)) {
      const er = c.errors ?? {};
      switch (name) {
        case 'email': return er['required'] || er['email'] || er['maxlength'] ? 'errors.invalid_email' : null;
        case 'username': return er['reserved'] ? 'errors.username_reserved' : 'errors.invalid_username';
        case 'displayName': return 'auth.required';
        case 'password': return er['maxlength'] ? 'errors.password_too_long' : 'errors.password_too_short';
      }
    }
    const e = this.error();
    return e && this.serverField() === name ? errorKey(e) : null;
  }

  onSubmit(): void {
    this.attempted = true;
    const relevant = this.mode() === 'full' ? ['email', 'username', 'displayName', 'password'] : ['password'];
    const invalid = relevant.some((k) => this.form.get(k)!.invalid);
    this.form.markAllAsTouched();
    if (invalid) return;
    const v = this.form.getRawValue();
    this.submitted.emit({ ...v, displayName: v.displayName.trim() });
  }
}
