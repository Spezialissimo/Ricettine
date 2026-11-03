import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKey, toApiError } from '../core/api-error';
import { RecipeApi } from './recipe.api';

/** Creates an empty draft and moves on to its editor (the new URL replaces this one in history). */
@Component({
  selector: 'app-new-recipe-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipes.scss',
  template: `
    <ng-container *transloco="let t">
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="retry" (click)="start()">{{ t('common.retry') }}</button>
      } @else {
        <p class="loading" role="status"><span class="spinner" aria-hidden="true"></span> {{ t('recipes.creating') }}</p>
      }
    </ng-container>
  `,
})
export class NewRecipePage {
  private readonly api = inject(RecipeApi);
  private readonly router = inject(Router);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.start();
  }

  async start(): Promise<void> {
    this.error.set(null);
    try {
      const recipe = await this.api.create();
      await this.router.navigateByUrl(`/recipes/${recipe.id}/edit`, { replaceUrl: true });
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }
}
