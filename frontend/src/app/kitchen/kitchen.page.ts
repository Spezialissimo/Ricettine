import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * My kitchen: the user's own recipes and cookbooks behind three tabs (Overview, Recipes, Cookbooks).
 * Each tab is its own route, so links and Back work; the tab content renders in the outlet.
 */
@Component({
  selector: 'app-kitchen-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('kitchen.title') }}</h1>
      <nav class="tabs" [attr.aria-label]="t('kitchen.tabs')">
        <a
          routerLink="/kitchen"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: true }"
          >{{ t('kitchen.overview') }}</a
        >
        <a routerLink="/kitchen/recipes" routerLinkActive="active" ariaCurrentWhenActive="page">{{
          t('kitchen.recipes')
        }}</a>
        <a routerLink="/kitchen/cookbooks" routerLinkActive="active" ariaCurrentWhenActive="page">{{
          t('kitchen.cookbooks')
        }}</a>
      </nav>
      <router-outlet />
    </ng-container>
  `,
  styles: `
    @use '../../styles/tokens' as t;

    :host {
      display: block;
    }
    h1 {
      margin: 0 0 t.$space-2;
      color: var(--link);
      font-size: 1.5rem;
    }
    .tabs {
      display: flex;
      gap: t.$space-1;
      margin-bottom: t.$space-4;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }
    .tabs a {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      padding: 0 t.$space-4;
      border-bottom: 3px solid transparent;
      margin-bottom: -1px;
      color: var(--muted);
      text-decoration: none;
      white-space: nowrap;
    }
    .tabs a:hover {
      color: var(--ink);
    }
    .tabs a.active {
      color: var(--ink);
      font-weight: 600;
      border-bottom-color: var(--accent);
    }
  `,
})
export class KitchenPage {}
