import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DISPLAY_NAME_VALIDATORS, USERNAME_VALIDATORS } from '../auth/account-form.component';
import { errorKeyOf } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { mediaUrl } from '../core/media';
import { SettingsApi } from './settings.api';

const MAX_AVATAR_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.profileTitle') }}</h1>
      <section class="card">
        <h2>{{ t('settings.avatar') }}</h2>
        <div class="avatar-row">
          @if (avatar(); as src) {
            <img class="avatar" [src]="src" [alt]="t('settings.avatarAlt')" />
          } @else {
            <span class="avatar placeholder" aria-hidden="true">{{ initial() }}</span>
          }
          <label class="btn">
            {{ uploading() ? t('settings.avatarUploading') : t('settings.avatarChoose') }}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              [disabled]="uploading() || removing()"
              (change)="onFile($event)"
            />
          </label>
          @if (avatar() && !uploading()) {
            <button
              type="button"
              class="btn"
              data-action="remove-avatar"
              [disabled]="removing()"
              (click)="removeAvatar()"
            >
              {{ t('settings.avatarRemove') }}
            </button>
          }
          @if (uploading()) {
            <span class="spinner" role="progressbar" aria-busy="true"></span>
          }
        </div>
        @if (avatarError(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
        }
      </section>
      <form class="card" (submit)="$event.preventDefault(); save()" novalidate>
        <label>
          {{ t('auth.displayName') }}
          <input
            type="text"
            name="displayName"
            [formControl]="displayName"
            autocomplete="name"
            [class.invalid]="displayName.invalid && attempted()"
          />
          @if (displayName.invalid && attempted()) {
            <span class="error">{{ t('auth.required') }}</span>
          }
        </label>
        <label>
          {{ t('auth.username') }}
          <input
            type="text"
            name="username"
            [formControl]="username"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            [class.invalid]="username.invalid && attempted()"
          />
          <span class="hint">{{ t('auth.usernameHint') }}</span>
          @if (username.invalid && attempted()) {
            <span class="error">{{
              t(
                username.errors?.['reserved']
                  ? 'errors.username_reserved'
                  : 'errors.invalid_username'
              )
            }}</span>
          }
        </label>
        @if (error(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
        }
        @if (saved()) {
          <p class="ok" role="status">{{ t('settings.saved') }}</p>
        }
        <button type="submit" class="primary" [disabled]="busy()">{{ t('common.save') }}</button>
      </form>
      <nav class="links">
        <a routerLink="/settings/password">{{ t('settings.linkPassword') }}</a>
        <a routerLink="/settings/delete">{{ t('settings.linkDelete') }}</a>
      </nav>
    </ng-container>
  `,
})
export class ProfilePage {
  private readonly api = inject(SettingsApi);
  private readonly auth = inject(AuthStore);
  readonly displayName = new FormControl(this.auth.me()?.displayName ?? '', {
    nonNullable: true,
    validators: DISPLAY_NAME_VALIDATORS,
  });
  readonly username = new FormControl(this.auth.me()?.username ?? '', {
    nonNullable: true,
    validators: USERNAME_VALIDATORS,
  });
  readonly attempted = signal(false);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly avatarError = signal<string | null>(null);
  readonly removing = signal(false);

  protected avatar = () => mediaUrl(this.auth.me()?.avatarUrl);
  protected initial = () => (this.auth.me()?.displayName ?? '?').charAt(0).toUpperCase();

  async save(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    this.saved.set(false);
    if (this.displayName.invalid || this.username.invalid) return;
    const me = this.auth.me();
    const body: { displayName?: string; username?: string } = {};
    const name = this.displayName.value.trim();
    if (name !== me?.displayName) body.displayName = name;
    if (this.username.value !== me?.username) body.username = this.username.value;
    if (!Object.keys(body).length) {
      this.saved.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.updateProfile(body);
      this.auth.setMe(updated);
      this.displayName.setValue(updated.displayName);
      this.username.setValue(updated.username);
      this.saved.set(true);
    } catch (e) {
      this.error.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.uploading()) return;
    this.avatarError.set(null);
    if (file.size > MAX_AVATAR_BYTES) {
      this.avatarError.set('errors.file_too_large');
      input.value = '';
      return;
    }
    this.uploading.set(true);
    try {
      const form = new FormData();
      form.append('file', file);
      this.auth.setMe(await this.api.uploadAvatar(form));
    } catch (e) {
      this.avatarError.set(errorKeyOf(e));
    } finally {
      this.uploading.set(false);
      input.value = ''; // allow re-selecting the same file
    }
  }

  async removeAvatar(): Promise<void> {
    if (this.removing() || this.uploading()) return;
    this.removing.set(true);
    this.avatarError.set(null);
    try {
      this.auth.setMe(await this.api.removeAvatar());
    } catch (e) {
      this.avatarError.set(errorKeyOf(e));
    } finally {
      this.removing.set(false);
    }
  }
}
