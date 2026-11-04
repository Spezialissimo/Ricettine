import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { SetupStatus } from '../core/auth.guards';
import { AuthStore } from '../core/auth.store';
import { CookbookApi } from '../cookbooks/cookbook.api';

@Component({
  selector: 'app-delete-account-page',
  imports: [ReactiveFormsModule, TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.deleteTitle') }}</h1>
      <form class="card" (submit)="$event.preventDefault(); submit()" novalidate>
        <p>{{ t('settings.deleteWarning') }}</p>
        @if (ownedCookbooks().length > 0) {
          <p>{{ t('settings.deleteCookbooks') }}</p>
          <ul data-owned-cookbooks>
            @for (name of ownedCookbooks(); track $index) { <li>{{ name }}</li> }
          </ul>
        }
        @if (cookbooksUnknown()) { <p>{{ t('settings.deleteCookbooksUnknown') }}</p> }
        <label>
          {{ t('auth.password') }}
          <input type="password" name="password" [formControl]="password" autocomplete="current-password"
            [class.invalid]="password.invalid && attempted()" />
        </label>
        @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
        <button type="submit" class="primary danger" [disabled]="busy()">{{ t('settings.deleteSubmit') }}</button>
      </form>
      <a class="btn-back" routerLink="/settings/profile">{{ t('common.back') }}</a>
    </ng-container>
  `,
})
export class DeleteAccountPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);
  private readonly setup = inject(SetupStatus);
  private readonly router = inject(Router);
  private readonly cookbooks = inject(CookbookApi);
  readonly ownedCookbooks = signal<string[]>([]);
  readonly cookbooksUnknown = signal(false);
  readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly busy = signal(false);
  readonly attempted = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const mine = await this.cookbooks.mine();
      this.ownedCookbooks.set(mine.filter((c) => c.role === 'OWNER').map((c) => c.name));
    } catch {
      this.cookbooksUnknown.set(true);
    }
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.attempted.set(true);
    if (this.password.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.delete<void>('/api/me', { body: { password: this.password.value } }),
      );
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
      this.busy.set(false);
      return;
    }
    this.auth.setMe(null);
    this.setup.refresh();
    const required = await this.setup.required();
    await this.router.navigateByUrl(required ? '/setup' : '/login');
    this.busy.set(false);
  }
}
