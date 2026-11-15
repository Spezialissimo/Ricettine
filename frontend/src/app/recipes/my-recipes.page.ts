import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { RecipeApi } from './recipe.api';
import { RecipeSummary } from './recipe.model';
import { RecipeCardsComponent } from './recipe-cards.component';

/** The Recipes tab of My kitchen: all of the user's recipes, drafts included, newest edit first. */
@Component({
  selector: 'app-my-recipes-page',
  imports: [RouterLink, TranslocoDirective, RecipeCardsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipes.scss',
  template: `
    <ng-container *transloco="let t">
      <h2 class="visually-hidden">{{ t('kitchen.recipes') }}</h2>
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="btn-primary retry" (click)="load()">
          {{ t('common.retry') }}
        </button>
      } @else if (recipes(); as list) {
        @if (list.length === 0) {
          <div class="empty-state">
            <p>{{ t('recipes.empty') }}</p>
            <a class="btn-primary" routerLink="/recipes/new">{{ t('recipes.emptyAction') }}</a>
          </div>
        } @else {
          <app-recipe-cards [recipes]="list" />
        }
      } @else {
        <p class="loading" role="status">{{ t('recipes.loading') }}</p>
      }
    </ng-container>
  `,
})
export class MyRecipesPage {
  private readonly api = inject(RecipeApi);
  protected readonly recipes = signal<RecipeSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.recipes.set(await this.api.mine());
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }
}
