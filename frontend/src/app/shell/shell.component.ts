import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth.store';

/**
 * Two layouts, switched purely by CSS at the desktop breakpoint: a top navigation bar on desktop
 * (`nav[aria-label=Main]`) and a compact top bar plus bottom navigation on phones (`nav[aria-label=Bottom]`).
 * The user name and the logout control live once, in the top bar, and stay reachable on both.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.component.scss',
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <div class="bar">
          <a class="logo" routerLink="/recipes">{{ t('common.appName') }}</a>
          <nav class="main-nav" [attr.aria-label]="t('nav.main')">
            <a routerLink="/recipes" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{
              t('nav.recipes')
            }}</a>
            <a class="new" routerLink="/recipes/new">{{ t('nav.newRecipe') }}</a>
            <a routerLink="/settings/profile" routerLinkActive="active">{{ t('nav.settings') }}</a>
            @if (auth.me()?.admin) {
              <a routerLink="/admin/invites" routerLinkActive="active">{{ t('nav.admin') }}</a>
            }
          </nav>
          <a class="new-icon" routerLink="/recipes/new" [attr.aria-label]="t('nav.newRecipeShort')">+</a>
          <div class="user">
            @if (auth.me(); as me) { <span class="who">{{ me.displayName }}</span> }
            <button type="button" class="logout" (click)="logout()">{{ t('auth.logout') }}</button>
          </div>
        </div>
      </header>
      <main><router-outlet /></main>
      <nav class="bottom-nav" [attr.aria-label]="t('nav.bottom')">
        <a routerLink="/recipes" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{
          t('nav.recipes')
        }}</a>
        <a routerLink="/settings/profile" routerLinkActive="active">{{ t('nav.settings') }}</a>
        @if (auth.me()?.admin) {
          <a routerLink="/admin/invites" routerLinkActive="active">{{ t('nav.admin') }}</a>
        }
      </nav>
    </ng-container>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
