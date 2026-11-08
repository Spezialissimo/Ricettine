import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AppDatePipe } from '../shared/app-date.pipe';
import { CopyLinkComponent } from '../shared/copy-link.component';
import { InviteList } from '../shared/invite-list';
import { AdminApi } from './admin.api';
import { AdminTabsComponent } from './admin-tabs.component';

@Component({
  selector: 'app-invites-page',
  imports: [TranslocoDirective, CopyLinkComponent, AppDatePipe, AdminTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../settings/settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <app-admin-tabs />
      <button type="button" class="primary" data-action="create" [disabled]="list.busy()" (click)="list.create()">
        {{ list.busy() ? t('admin.creating') : t('admin.createInvite') }}
      </button>
      @if (list.error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
      @if (list.created(); as c) {
        <h2>{{ t('admin.inviteReady') }}</h2>
        <app-copy-link [url]="c.url" [expiresAt]="c.expiresAt" />
      }
      <h2>{{ t('admin.activeInvites') }}</h2>
      @if (list.invites().length === 0) {
        <p class="muted">{{ t('admin.noInvites') }}</p>
      } @else {
        <ul class="list">
          @for (i of list.invites(); track i.id) {
            <li [attr.data-invite]="i.id">
              <span class="muted">{{ t('common.expiresOn', { date: (i.expiresAt | appDate: 'dateTime') }) }}</span>
              <button type="button" class="btn" (click)="list.revoke(i.id)">{{ t('admin.revoke') }}</button>
            </li>
          }
        </ul>
      }
    </ng-container>
  `,
})
export class InvitesPage implements OnInit {
  private readonly api = inject(AdminApi);
  protected readonly list = new InviteList({
    list: () => this.api.invites(),
    create: () => this.api.createInvite(),
    revoke: (id) => this.api.revokeInvite(id),
  });

  ngOnInit(): Promise<void> {
    return this.list.load();
  }
}
