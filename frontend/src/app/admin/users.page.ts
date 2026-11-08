import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { CopyLinkComponent } from '../shared/copy-link.component';
import { AdminApi } from './admin.api';
import { AdminUser as User, PasswordReset } from './admin.model';
import { AdminTabsComponent } from './admin-tabs.component';

type Reset = PasswordReset & { name: string };

@Component({
  selector: 'app-users-page',
  imports: [TranslocoDirective, CopyLinkComponent, AdminTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../settings/settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <app-admin-tabs />
      @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
      @if (reset(); as r) {
        <h2>{{ t('admin.resetReady', { name: r.name }) }}</h2>
        <app-copy-link [url]="r.url" [expiresAt]="r.expiresAt" />
      }
      <ul class="list">
        @for (u of users(); track u.id) {
          <li [attr.data-user]="u.id">
            <span>
              <strong>{{ u.displayName }}</strong>
              @if (u.admin) { <span class="muted"> ({{ t('admin.adminBadge') }})</span> }
              <br /><span class="muted">&#64;{{ u.username }} &middot; {{ u.email }}</span>
            </span>
            <span class="actions">
              @if (canChangeRole(u)) {
                <button type="button" class="btn" data-action="role" [disabled]="busy()" (click)="toggleAdmin(u)">
                  {{ t(u.admin ? 'admin.removeAdmin' : 'admin.makeAdmin') }}
                </button>
              }
              <button type="button" class="btn" data-action="reset" (click)="resetPassword(u)">{{ t('admin.resetPassword') }}</button>
            </span>
          </li>
        }
      </ul>
    </ng-container>
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly users = signal<User[]>([]);
  readonly reset = signal<Reset | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  private readonly adminCount = computed(() => this.users().filter((u) => u.admin).length);

  /** The last admin can't demote themselves (the server would answer 409 last_admin). */
  canChangeRole(u: User): boolean {
    return !(u.id === this.auth.me()?.id && u.admin && this.adminCount() <= 1);
  }

  async toggleAdmin(u: User): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.setAdmin(u.id, !u.admin);
      if (u.id === this.auth.me()?.id) {
        // A role change ends all of the target's sessions, including this one: sign in again.
        this.auth.setMe(null);
        await this.router.navigateByUrl('/login');
        return;
      }
      this.users.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      this.error.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      this.users.set(await this.api.users());
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }

  async resetPassword(u: User): Promise<void> {
    this.error.set(null);
    try {
      const r = await this.api.passwordReset(u.id);
      this.reset.set({ name: u.displayName, ...r });
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }
}
