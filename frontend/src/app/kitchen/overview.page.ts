import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { CookbookApi } from '../cookbooks/cookbook.api';
import { CookbookCardsComponent } from '../cookbooks/cookbook-cards.component';
import { CookbookSummary } from '../cookbooks/cookbook.model';
import { NewCookbookFlow } from '../cookbooks/new-cookbook';
import { RecipeApi } from '../recipes/recipe.api';
import { RecipeCardsComponent } from '../recipes/recipe-cards.component';
import { RecipeSummary } from '../recipes/recipe.model';

/** How many recipes and cookbooks the Overview shows before "Show more" (one row on wide desktops). */
export const OVERVIEW_LIMIT = 4;

type Section<T> = { items: T[] | null; error: string | null };

/**
 * The Overview tab of My kitchen: the most recently edited recipes and cookbooks, each section with
 * "Show more" to its tab. The two sections load and fail independently.
 */
@Component({
  selector: 'app-kitchen-overview',
  imports: [RouterLink, TranslocoDirective, RecipeCardsComponent, CookbookCardsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <section aria-labelledby="ov-recipes">
        <div class="head">
          <h2 id="ov-recipes">{{ t('kitchen.recipes') }}</h2>
          @if (recipes().items?.length) {
            <a
              class="more"
              routerLink="/kitchen/recipes"
              [attr.aria-label]="t('kitchen.showMoreRecipes')"
              >{{ t('kitchen.showMore') }}</a
            >
          }
        </div>
        @if (recipes().error; as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
          <button type="button" class="btn-primary retry" (click)="loadRecipes()">
            {{ t('common.retry') }}
          </button>
        } @else if (recipes().items; as list) {
          @if (list.length === 0) {
            <div class="empty-state">
              <p>{{ t('recipes.empty') }}</p>
              <a class="btn-primary" routerLink="/recipes/new">{{ t('recipes.emptyAction') }}</a>
            </div>
          } @else {
            <app-recipe-cards [recipes]="list.slice(0, limit)" />
          }
        } @else {
          <p class="loading" role="status">{{ t('recipes.loading') }}</p>
        }
      </section>

      <section aria-labelledby="ov-cookbooks">
        <div class="head">
          <h2 id="ov-cookbooks">{{ t('kitchen.cookbooks') }}</h2>
          @if (cookbooks().items?.length) {
            <a
              class="more"
              routerLink="/kitchen/cookbooks"
              [attr.aria-label]="t('kitchen.showMoreCookbooks')"
              >{{ t('kitchen.showMore') }}</a
            >
          }
        </div>
        @if (cookbooks().error; as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
          <button type="button" class="btn-primary retry" (click)="loadCookbooks()">
            {{ t('common.retry') }}
          </button>
        } @else if (cookbooks().items; as list) {
          @if (list.length === 0) {
            <div class="empty-state">
              <p>{{ t('cookbooks.empty') }}</p>
              <button type="button" class="btn-primary new" (click)="newCookbook.start()">
                {{ t('cookbooks.emptyAction') }}
              </button>
            </div>
          } @else {
            <app-cookbook-cards [cookbooks]="list.slice(0, limit)" />
          }
        } @else {
          <p class="loading" role="status">{{ t('cookbooks.loading') }}</p>
        }
      </section>
    </ng-container>
  `,
  styles: `
    @use '../../styles/tokens' as t;

    :host {
      display: block;
    }
    section + section {
      margin-top: t.$space-8;
    }
    .head {
      display: flex;
      align-items: center;
      gap: t.$space-3;
      flex-wrap: wrap;
      margin-bottom: t.$space-3;
    }
    h2 {
      margin: 0 auto 0 0;
      font-size: 1.2rem;
    }
    .more {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      padding: 0 t.$space-2;
      color: var(--link);
      font-weight: 600;
      text-decoration: none;
    }
    .more:hover {
      text-decoration: underline;
    }
    .alert {
      color: var(--danger);
    }
    .loading {
      color: var(--muted);
    }
  `,
})
export class KitchenOverviewPage {
  private readonly recipeApi = inject(RecipeApi);
  private readonly cookbookApi = inject(CookbookApi);
  protected readonly newCookbook = inject(NewCookbookFlow);
  protected readonly limit = OVERVIEW_LIMIT;
  protected readonly recipes = signal<Section<RecipeSummary>>({ items: null, error: null });
  protected readonly cookbooks = signal<Section<CookbookSummary>>({ items: null, error: null });

  constructor() {
    void this.loadRecipes();
    void this.loadCookbooks();
  }

  async loadRecipes(): Promise<void> {
    this.recipes.set({ items: null, error: null });
    try {
      this.recipes.set({ items: await this.recipeApi.mine(), error: null });
    } catch (e) {
      this.recipes.set({ items: null, error: errorKeyOf(e) });
    }
  }

  async loadCookbooks(): Promise<void> {
    this.cookbooks.set({ items: null, error: null });
    try {
      this.cookbooks.set({ items: await this.cookbookApi.mine(), error: null });
    } catch (e) {
      this.cookbooks.set({ items: null, error: errorKeyOf(e) });
    }
  }
}
