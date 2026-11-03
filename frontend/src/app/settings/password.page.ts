import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { PASSWORD_VALIDATORS } from '../auth/account-form.component';
import { errorKey, toApiError } from '../core/api-error';

@Component({
  selector: 'app-password-page',
  imports: [ReactiveFormsModule, TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.passwordTitle') }}</h1>
      <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label>
          {{ t('settings.currentPassword') }}
          <input type="password" name="currentPassword" formControlName="currentPassword"
            autocomplete="current-password" [class.invalid]="bad('currentPassword')" />
        </label>
        <label>
          {{ t('auth.newPassword') }}
          <input type="password" name="newPassword" formControlName="newPassword"
            autocomplete="new-password" [class.invalid]="bad('newPassword')" />
          <span class="hint">{{ t('auth.passwordHint') }}</span>
          @if (bad('newPassword')) {
            <span class="error">{{ t(form.controls.newPassword.errors?.['maxlength'] ? 'errors.password_too_long' : 'errors.password_too_short') }}</span>
          }
        </label>
        @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
        @if (done()) { <p class="ok" role="status">{{ t('settings.passwordDone') }}</p> }
        <button type="submit" class="primary" [disabled]="busy()">{{ t('settings.passwordSubmit') }}</button>
      </form>
      <a class="btn-back" routerLink="/settings/profile">{{ t('common.back') }}</a>
    </ng-container>
  `,
})
export class PasswordPage {
  private readonly http = inject(HttpClient);
  readonly form = new FormGroup({
    currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPassword: new FormControl('', { nonNullable: true, validators: PASSWORD_VALIDATORS }),
  });
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);
  private readonly attempted = signal(false);

  bad(name: 'currentPassword' | 'newPassword'): boolean {
    return this.form.controls[name].invalid && (this.attempted() || this.form.controls[name].dirty);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.done.set(false);
    this.form.markAllAsDirty();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put<void>('/api/me/password', this.form.getRawValue()));
      this.done.set(true);
      this.form.reset();
      this.attempted.set(false);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
