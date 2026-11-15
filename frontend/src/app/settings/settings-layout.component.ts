import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth.store';
import { Site } from '../core/site';

/**
 * Settings: one navigation with two groups, Account (Profile, Appearance, Language, Password, Delete
 * account) and, for admins, Administration (Invites, Users). A sidebar on desktop; on the phone a row of chips above the page.
 */
@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <nav class="side" [attr.aria-label]="t('settings.tabs')">
        <div class="group" role="group" aria-labelledby="settings-account">
          <span class="group-label" id="settings-account">{{ t('settings.groupAccount') }}</span>
          @if (!site.demo()) {
            <a
              routerLink="/settings/profile"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('settings.tabProfile') }}</a
            >
          }
          <a
            routerLink="/settings/appearance"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            >{{ t('settings.tabAppearance') }}</a
          >
          <a
            routerLink="/settings/language"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            >{{ t('settings.tabLanguage') }}</a
          >
          @if (!site.demo()) {
            <a
              routerLink="/settings/password"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('settings.tabPassword') }}</a
            >
            <a
              routerLink="/settings/delete"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('settings.tabDelete') }}</a
            >
          }
        </div>
        @if (auth.me()?.admin) {
          <div class="group" role="group" aria-labelledby="settings-admin">
            <span class="group-label" id="settings-admin">{{ t('settings.groupAdmin') }}</span>
            <a
              routerLink="/settings/admin/invites"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('settings.tabInvites') }}</a
            >
            <a
              routerLink="/settings/admin/users"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              >{{ t('settings.tabUsers') }}</a
            >
          </div>
        }
      </nav>
      <div class="content"><router-outlet /></div>
    </ng-container>
  `,
  styles: `
    @use '../../styles/tokens' as t;

    :host {
      display: block;
    }
    // The menu and the page are separated by a line: below the chips on the phone, a vertical
    // line between the sidebar and the page on desktop.
    .side {
      display: flex;
      flex-wrap: wrap;
      gap: t.$space-2 t.$space-4;
      padding-bottom: t.$space-4;
      margin-bottom: t.$space-6;
      border-bottom: 1px solid var(--border);
    }
    .group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: t.$space-2;
    }
    // Group titles must not read as links: dark ink, bold, small caps with wide tracking; the links
    // below are regular weight (muted on desktop, chips on the phone).
    .group-label {
      width: 100%;
      color: var(--ink);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    a {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      padding: 0 t.$space-3;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      color: var(--ink);
      text-decoration: none;
      white-space: nowrap;
    }
    a:hover {
      border-color: var(--muted);
    }
    // the selected item: a light green fill, like the servings pill once changed
    a.active {
      border-color: var(--accent);
      background: var(--badge-public-bg);
      color: var(--ink);
      font-weight: 600;
    }
    .content {
      min-width: 0;
      max-width: 560px;
    }

    @media (min-width: t.$bp-desktop) {
      :host {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        align-items: stretch;
      }
      .side {
        flex-direction: column;
        flex-wrap: nowrap;
        gap: t.$space-6;
        margin: 0;
        padding: 0 t.$space-6 0 0;
        border-bottom: 0;
      }
      .content {
        min-height: 60vh;
        padding-left: t.$space-8;
        border-left: 1px solid var(--border);
      }
      .group {
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
      }
      .group-label {
        padding: 0 t.$space-3 t.$space-2;
        margin-bottom: t.$space-1;
        border-bottom: 1px solid var(--border);
      }
      a {
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--muted);
      }
      a:hover {
        background: var(--surface);
        color: var(--ink);
      }
      a.active {
        background: var(--badge-public-bg);
        color: var(--ink);
      }
    }
  `,
})
export class SettingsLayoutComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly site = inject(Site);
}
