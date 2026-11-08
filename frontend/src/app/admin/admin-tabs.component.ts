import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

/** The admin heading and its Invites / Users tabs; styled by `settings-page.scss` of the host page. */
@Component({
  selector: 'app-admin-tabs',
  imports: [TranslocoDirective, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('admin.title') }}</h1>
      <nav class="tabs">
        <a routerLink="/admin/invites" routerLinkActive="active">{{ t('admin.invites') }}</a>
        <a routerLink="/admin/users" routerLinkActive="active">{{ t('admin.users') }}</a>
      </nav>
    </ng-container>
  `,
})
export class AdminTabsComponent {}
