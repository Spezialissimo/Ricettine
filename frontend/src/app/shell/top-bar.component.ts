import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { IconComponent } from '../shared/icon.component';
import { AccountMenuComponent } from './account-menu.component';

/**
 * The one top bar of the app: the shell and the shared recipe / cookbook pages use it. Signed in, desktop:
 * logo, Discover / My kitchen, "+ New recipe" (not while editing), account menu. Signed in, phone: a ☰ menu
 * before the logo (a panel from the left: Discover, My kitchen, New recipe) and the account menu; there is
 * no bottom bar. Signed out: logo and Log in (back to `loginNext`).
 */
@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, AccountMenuComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './top-bar.component.scss',
  host: { '(document:keydown.escape)': 'close(true)' },
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <div class="bar">
          @if (auth.me()) {
            <button
              type="button"
              class="burger"
              aria-controls="app-drawer"
              [attr.aria-expanded]="open()"
              [attr.aria-label]="t('nav.openMenu')"
              [attr.title]="t('nav.openMenu')"
              (click)="toggle()"
            >
              <app-icon name="menu" />
            </button>
          }
          <a class="logo" routerLink="/">{{ t('common.appName') }}</a>
          @if (auth.me()) {
            <nav class="main-nav" [attr.aria-label]="t('nav.main')">
              <a
                routerLink="/"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="{ exact: true }"
                >{{ t('nav.discover') }}</a
              >
              <a routerLink="/kitchen" routerLinkActive="active" ariaCurrentWhenActive="page">{{
                t('nav.kitchen')
              }}</a>
            </nav>
            @if (!editing()) {
              <a class="new" routerLink="/recipes/new">{{ t('nav.newRecipe') }}</a>
            }
            <app-account-menu />
          } @else {
            <a
              class="login"
              routerLink="/login"
              [queryParams]="loginNext() ? { next: loginNext() } : {}"
              >{{ t('auth.login') }}</a
            >
          }
        </div>
      </header>
      @if (open()) {
        <div class="backdrop" (click)="close(true)"></div>
        <nav class="drawer" id="app-drawer" [attr.aria-label]="t('nav.sections')">
          <div class="drawer-head">
            <a class="drawer-logo" routerLink="/">{{ t('common.appName') }}</a>
            <button
              type="button"
              class="drawer-close"
              [attr.aria-label]="t('nav.closeMenu')"
              [attr.title]="t('nav.closeMenu')"
              (click)="close(true)"
            >
              <app-icon name="close" />
            </button>
          </div>
          <a
            routerLink="/"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: true }"
            >{{ t('nav.discover') }}</a
          >
          <a routerLink="/kitchen" routerLinkActive="active" ariaCurrentWhenActive="page">{{
            t('nav.kitchen')
          }}</a>
          <a class="drawer-new" routerLink="/recipes/new"
            ><app-icon name="plus" />{{ t('nav.newRecipeItem') }}</a
          >
        </nav>
      }
    </ng-container>
  `,
})
export class TopBarComponent {
  protected readonly auth = inject(AuthStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** In the recipe editor: no new-recipe action. */
  readonly editing = input(false);
  /** Signed out: where Log in returns to. */
  readonly loginNext = input<string | null>(null);
  protected readonly open = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.close(false));
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.open.set(true);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('.drawer > a')?.focus(),
      {
        injector: this.injector,
      },
    );
  }

  /** Closes the menu; `refocus` puts focus back on ☰ (Escape, close button, backdrop). */
  close(refocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.host.nativeElement.querySelector<HTMLElement>('.burger')?.focus();
  }
}
