import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

/** The admin heading and its Invites / Users tabs with their own styles (emulated encapsulation keeps the host page's stylesheet out). */
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
  styles: `
    @use '../../styles/tokens' as t;

    :host {
      display: block;
    }
    h1 {
      margin: 0 0 t.$space-4;
      color: t.$accent;
      font-size: 1.5rem;
    }
    .tabs {
      display: flex;
      gap: t.$space-2;
      margin-bottom: t.$space-4;
    }
    .tabs a {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      padding: 0 t.$space-3;
      color: t.$muted;
    }
    .tabs a.active {
      color: t.$accent;
      font-weight: 600;
    }
  `,
})
export class AdminTabsComponent {}
