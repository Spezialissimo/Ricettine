import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { mediaUrl } from '../core/media';

/** One recipe card in a cookbook: where it opens (null: not openable here) and what it shows. */
export type CookbookCard = {
  recipeId: string;
  title: string;
  authorName: string | null;
  coverThumbUrl: string | null;
  link: unknown[] | null;
};

/** The card of a cookbook entry, opening at `link`. */
export function toCard(
  r: {
    recipeId: string;
    title: string;
    author: { displayName: string } | null;
    coverThumbUrl: string | null;
  },
  link: unknown[] | null,
): CookbookCard {
  return {
    recipeId: r.recipeId,
    title: r.title,
    authorName: r.author?.displayName ?? null,
    coverThumbUrl: r.coverThumbUrl,
    link,
  };
}

/** A cookbook's recipes as big cards (a 4:3 photo on top, title, author), the same on both cookbook pages. */
@Component({
  selector: 'app-cookbook-recipe-cards',
  imports: [RouterLink, NgTemplateOutlet, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbook-recipe-cards.component.scss',
  template: `
    <ng-container *transloco="let t">
      <ul class="recipe-grid">
        @for (r of cards(); track r.recipeId) {
          <li>
            @if (r.link; as link) {
              <a class="recipe-card" [routerLink]="link">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: r }" />
              </a>
            } @else {
              <div class="recipe-card">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: r }" />
              </div>
            }
          </li>
        }
      </ul>
      <ng-template #card let-r>
        @if (photo(r.coverThumbUrl); as src) {
          <img class="card-photo" [src]="src" alt="" loading="lazy" />
        } @else {
          <span class="card-photo none" aria-hidden="true"></span>
        }
        <span class="card-body">
          <span class="card-title">{{ r.title }}</span>
          <span class="entry-meta">{{
            t('recipes.by', { name: r.authorName ?? t('cookbooks.deletedUser') })
          }}</span>
        </span>
      </ng-template>
    </ng-container>
  `,
})
export class CookbookRecipeCardsComponent {
  readonly cards = input.required<CookbookCard[]>();
  protected photo(url: string | null): string | null {
    return mediaUrl(url);
  }
}
