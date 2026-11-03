import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { CopyLinkComponent } from '../shared/copy-link.component';

type Invite = { id: string; createdAt: string; expiresAt: string };
type Created = { id: string; url: string; expiresAt: string };

@Component({
  selector: 'app-invites-page',
  imports: [TranslocoDirective, CopyLinkComponent, DatePipe, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../settings/settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('admin.title') }}</h1>
      <nav class="tabs">
        <a routerLink="/admin/invites" routerLinkActive="active">{{ t('admin.invites') }}</a>
        <a routerLink="/admin/users" routerLinkActive="active">{{ t('admin.users') }}</a>
      </nav>
      <button type="button" class="primary" data-action="create" [disabled]="busy()" (click)="create()">
        {{ busy() ? t('admin.creating') : t('admin.createInvite') }}
      </button>
      @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
      @if (created(); as c) {
        <h2>{{ t('admin.inviteReady') }}</h2>
        <app-copy-link [url]="c.url" [expiresAt]="c.expiresAt" />
      }
      <h2>{{ t('admin.activeInvites') }}</h2>
      @if (invites().length === 0) {
        <p class="muted">{{ t('admin.noInvites') }}</p>
      } @else {
        <ul class="list">
          @for (i of invites(); track i.id) {
            <li [attr.data-invite]="i.id">
              <span class="muted">{{ t('common.expiresOn', { date: (i.expiresAt | date: 'medium') }) }}</span>
              <button type="button" class="btn" (click)="revoke(i.id)">{{ t('admin.revoke') }}</button>
            </li>
          }
        </ul>
      }
    </ng-container>
  `,
})
export class InvitesPage implements OnInit {
  private readonly http = inject(HttpClient);
  readonly invites = signal<Invite[]>([]);
  readonly created = signal<Created | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.invites.set(await firstValueFrom(this.http.get<Invite[]>('/api/admin/invites')));
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  async create(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const c = await firstValueFrom(this.http.post<Created>('/api/admin/invites', null));
      this.created.set(c);
      this.invites.update((l) => [...l, { id: c.id, createdAt: new Date().toISOString(), expiresAt: c.expiresAt }]);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete<void>(`/api/admin/invites/${encodeURIComponent(id)}`));
      this.invites.update((l) => l.filter((i) => i.id !== id));
      if (this.created()?.id === id) this.created.set(null);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }
}
