import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { UnsavedBackup } from '../recipes/editor/unsaved-backup';

/**
 * Two layouts, switched purely by CSS at the desktop breakpoint: a top navigation bar on desktop
 * (`nav[aria-label=Main]`) and a compact top bar plus bottom navigation on phones (`nav[aria-label=Sections]`).
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
          <a class="logo" routerLink="/">{{ t('common.appName') }}</a>
          <nav class="main-nav" [attr.aria-label]="t('nav.main')">
            <a
              routerLink="/"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: true }"
              >{{ t('nav.home') }}</a
            >
            <a
              routerLink="/recipes"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: true }"
              >{{ t('nav.recipes') }}</a
            >
            <a routerLink="/cookbooks" routerLinkActive="active" ariaCurrentWhenActive="page">{{
              t('nav.cookbooks')
            }}</a>
            <a class="new" routerLink="/recipes/new">{{ t('nav.newRecipe') }}</a>
            <a
              routerLink="/settings/profile"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('nav.settings') }}</a
            >
            @if (auth.me()?.admin) {
              <a
                routerLink="/admin/invites"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                >{{ t('nav.admin') }}</a
              >
            }
          </nav>
          <a class="new-icon" routerLink="/recipes/new" [attr.aria-label]="t('nav.newRecipeShort')"
            >+</a
          >
          <div class="user">
            @if (auth.me(); as me) {
              <a
                class="who"
                [routerLink]="['/u', me.username]"
                [attr.aria-label]="t('nav.profile')"
                >{{ me.displayName }}</a
              >
            }
            <button type="button" class="logout" (click)="logout()">{{ t('auth.logout') }}</button>
          </div>
        </div>
        @if (logoutError(); as key) {
          <div class="logout-error" role="alert">
            <span>{{ t(key) }}</span>
            <button type="button" class="logout-retry" (click)="logout()">
              {{ t('common.retry') }}
            </button>
          </div>
        }
      </header>
      <main><router-outlet /></main>
      <nav class="bottom-nav" [attr.aria-label]="t('nav.sections')">
        <a
          routerLink="/"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: true }"
          >{{ t('nav.home') }}</a
        >
        <a
          routerLink="/recipes"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: true }"
          >{{ t('nav.recipes') }}</a
        >
        <a routerLink="/cookbooks" routerLinkActive="active" ariaCurrentWhenActive="page">{{
          t('nav.cookbooks')
        }}</a>
        <a routerLink="/settings/profile" routerLinkActive="active" ariaCurrentWhenActive="page">{{
          t('nav.settings')
        }}</a>
        @if (auth.me()?.admin) {
          <a routerLink="/admin/invites" routerLinkActive="active" ariaCurrentWhenActive="page">{{
            t('nav.admin')
          }}</a>
        }
      </nav>
    </ng-container>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly backup = inject(UnsavedBackup);

  protected readonly logoutError = signal<string | null>(null);

  async logout(): Promise<void> {
    this.logoutError.set(null);
    try {
      await this.auth.logout();
    } catch (e) {
      this.logoutError.set(errorKeyOf(e));
      return;
    }
    this.backup.sweep();
    await this.router.navigateByUrl('/login');
  }
}
