import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from './core/auth.store';

/** Placeholder home; replaced by the recipe list in Plan 4. */
@Component({
  selector: 'app-home-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../styles/tokens' as t;
    button { @include t.touch-target; padding: 0 t.$space-4; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('home.greeting', { name: auth.me()?.displayName }) }}</h1>
      <button type="button" (click)="logout()">{{ t('auth.logout') }}</button>
    </ng-container>
  `,
})
export class HomePage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
