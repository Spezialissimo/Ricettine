import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth.store';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.component.scss',
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <span class="title">{{ t('common.appName') }}</span>
        @if (auth.me(); as me) { <span class="who">{{ me.displayName }}</span> }
      </header>
      <main><router-outlet /></main>
      <nav class="bottom-nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{
          t('nav.home')
        }}</a>
        <a routerLink="/settings/profile" routerLinkActive="active">{{ t('nav.settings') }}</a>
        @if (auth.me()?.admin) {
          <a routerLink="/admin/invites" routerLinkActive="active">{{ t('nav.admin') }}</a>
        }
        <!-- Recipes link is added in Plan 4. -->
      </nav>
    </ng-container>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthStore);
}
