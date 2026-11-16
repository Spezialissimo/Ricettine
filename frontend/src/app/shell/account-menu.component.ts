import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { errorKeyOf } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { mediaUrl } from '../core/media';
import { UnsavedBackup } from '../recipes/editor/unsaved-backup';

/**
 * The user's avatar and name; a disclosure button that opens a panel with View profile, Settings,
 * Admin (admins only) and Log out. The panel closes on Escape, an outside click and navigation.
 * A failed logout keeps the panel open and shows the error with Retry inside it.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    <ng-container *transloco="let t">
      @if (auth.me(); as me) {
        <button
          type="button"
          class="trigger"
          aria-controls="account-panel"
          [attr.aria-expanded]="open()"
          (click)="toggle()"
        >
          @if (avatar(); as src) {
            <img class="avatar" [src]="src" alt="" />
          } @else {
            <span class="avatar initial" aria-hidden="true">{{ initial() }}</span>
          }
          <span class="name">{{ me.displayName }}</span>
          <svg class="caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        @if (open()) {
          <div class="panel" id="account-panel">
            <nav [attr.aria-label]="t('nav.account')">
              <a [routerLink]="['/u', me.username]">{{ t('nav.viewProfile') }}</a>
              <a routerLink="/settings/profile">{{ t('nav.settings') }}</a>
              @if (me.admin) {
                <a routerLink="/settings/admin/invites">{{ t('nav.admin') }}</a>
              }
            </nav>
            <button type="button" class="logout" [disabled]="busy()" (click)="logout()">
              {{ t('auth.logout') }}
            </button>
            @if (logoutError(); as key) {
              <div class="logout-error" role="alert">
                <span>{{ t(key) }}</span>
                <button type="button" class="logout-retry" [disabled]="busy()" (click)="logout()">
                  {{ t('common.retry') }}
                </button>
              </div>
            }
          </div>
        }
      }
    </ng-container>
  `,
  styles: `
    @use '../../styles/tokens' as t;

    :host {
      position: relative;
      display: block;
      min-width: 0;
    }
    // The trigger sits on the green top bar: white text and chevron, a light wash on hover/open.
    .trigger {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      gap: t.$space-2;
      max-width: 14rem;
      padding: 0 t.$space-2 0 t.$space-1;
      border: 1px solid transparent;
      border-radius: 999px;
      background: transparent;
      color: var(--topbar-ink);
      cursor: pointer;
    }
    .trigger:hover,
    .trigger[aria-expanded='true'] {
      border-color: rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.14);
    }
    .avatar {
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: 50%;
      object-fit: cover;
      background: var(--surface);
    }
    .avatar.initial {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--pill-bg);
      color: var(--pill-ink);
      font-weight: 700;
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.95rem;
    }
    .caret {
      width: 20px;
      height: 20px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.15s ease;
    }
    .trigger[aria-expanded='true'] .caret {
      transform: rotate(180deg);
    }
    @media (prefers-reduced-motion: reduce) {
      .caret {
        transition: none;
      }
    }
    .panel {
      position: absolute;
      right: 0;
      top: calc(100% + #{t.$space-1});
      z-index: 2;
      min-width: 13rem;
      padding: t.$space-2;
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--border);
      border-radius: t.$radius;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }
    nav {
      display: flex;
      flex-direction: column;
    }
    nav a,
    .logout {
      @include t.touch-target;
      display: flex;
      align-items: center;
      width: 100%;
      padding: 0 t.$space-3;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    nav a:hover,
    .logout:hover {
      background: var(--bg);
    }
    .logout {
      margin-top: t.$space-1;
      border-top: 1px solid var(--border);
      border-radius: 0 0 8px 8px;
    }
    .logout-error {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: t.$space-2;
      padding: t.$space-2 t.$space-3 0;
      color: var(--danger);
      font-size: 0.9rem;
    }
  `,
})
export class AccountMenuComponent {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly backup = inject(UnsavedBackup);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  protected readonly avatar = () => mediaUrl(this.auth.me()?.avatarUrl);
  protected readonly initial = () => (this.auth.me()?.displayName ?? '?').charAt(0).toUpperCase();

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.close(false));
  }

  protected toggle(): void {
    if (this.open()) this.close(false);
    else this.open.set(true);
  }

  /** Closes the panel; `refocus` returns focus to the trigger (Escape), so keyboard users are not lost. */
  close(refocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.logoutError.set(null);
    if (refocus) this.host.nativeElement.querySelector<HTMLElement>('.trigger')?.focus();
  }

  protected onDocumentClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) this.close(false);
  }

  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.logoutError.set(null);
    try {
      await this.auth.logout();
    } catch (e) {
      this.logoutError.set(errorKeyOf(e));
      return;
    } finally {
      this.busy.set(false);
    }
    this.open.set(false);
    this.backup.sweep();
    await this.router.navigateByUrl('/login');
  }
}
