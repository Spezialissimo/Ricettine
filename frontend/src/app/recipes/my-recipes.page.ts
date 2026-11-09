import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { mediaUrl } from '../core/media';
import { RecipeApi } from './recipe.api';
import { RecipeSummary } from './recipe.model';

@Component({
  selector: 'app-my-recipes-page',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipes.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('recipes.title') }}</h1>
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="retry" (click)="load()">{{ t('common.retry') }}</button>
      } @else if (recipes(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ t('recipes.empty') }}</p>
          <a class="primary" routerLink="/recipes/new">{{ t('recipes.emptyAction') }}</a>
        } @else {
          <ul class="grid">
            @for (r of list; track r.id) {
              <li>
                <a class="recipe" [routerLink]="['/recipes', r.id, 'edit']">
                  @if (thumb(r); as src) {
                    <img
                      class="thumb"
                      [src]="src"
                      [alt]="t('recipes.coverAlt', { title: r.title || t('recipes.untitled') })"
                    />
                  } @else {
                    <span class="thumb none" aria-hidden="true"></span>
                  }
                  <span class="body">
                    <span class="name" [class.untitled]="!r.title">{{
                      r.title || t('recipes.untitled')
                    }}</span>
                    <span class="badge" [attr.data-badge]="badge(r)">{{
                      t('recipes.status.' + badge(r))
                    }}</span>
                  </span>
                </a>
              </li>
            }
          </ul>
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

  protected thumb(r: RecipeSummary): string | null {
    return mediaUrl(r.coverThumbUrl);
  }

  protected badge(r: RecipeSummary): 'draft' | 'private' | 'public' {
    if (r.status === 'DRAFT') return 'draft';
    return r.visibility === 'PUBLIC' ? 'public' : 'private';
  }
}
