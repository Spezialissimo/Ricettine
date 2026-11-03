import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.component.scss',
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <span class="title">{{ t('common.appName') }}</span>
      </header>
      <main><router-outlet /></main>
      <nav class="bottom-nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{
          t('nav.home')
        }}</a>
        <a routerLink="/settings" routerLinkActive="active">{{ t('nav.settings') }}</a>
      </nav>
    </ng-container>
  `,
})
export class ShellComponent {}
