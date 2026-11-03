import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { CopyLinkComponent } from '../shared/copy-link.component';

type User = { id: string; username: string; displayName: string; email: string; admin: boolean; createdAt: string };
type Reset = { name: string; url: string; expiresAt: string };

@Component({
  selector: 'app-users-page',
  imports: [TranslocoDirective, CopyLinkComponent, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../settings/settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('admin.title') }}</h1>
      <nav class="tabs">
        <a routerLink="/admin/invites" routerLinkActive="active">{{ t('admin.invites') }}</a>
        <a routerLink="/admin/users" routerLinkActive="active">{{ t('admin.users') }}</a>
      </nav>
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
            <button type="button" class="btn" (click)="resetPassword(u)">{{ t('admin.resetPassword') }}</button>
          </li>
        }
      </ul>
    </ng-container>
  `,
})
export class UsersPage implements OnInit {
  private readonly http = inject(HttpClient);
  readonly users = signal<User[]>([]);
  readonly reset = signal<Reset | null>(null);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.users.set(await firstValueFrom(this.http.get<User[]>('/api/admin/users')));
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  async resetPassword(u: User): Promise<void> {
    this.error.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<{ url: string; expiresAt: string }>(`/api/admin/users/${encodeURIComponent(u.id)}/password-reset`, null),
      );
      this.reset.set({ name: u.displayName, ...r });
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }
}
