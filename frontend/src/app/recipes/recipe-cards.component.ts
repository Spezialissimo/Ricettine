import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { mediaUrl } from '../core/media';
import { RecipeSummary } from './recipe.model';

/** The user's own recipes as cards (title, cover thumb, status badge), each opening the recipe (Edit is there). */
@Component({
  selector: 'app-recipe-cards',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipes.scss',
  template: `
    <ul class="grid" *transloco="let t">
      @for (r of recipes(); track r.id) {
        <li>
          <a class="recipe" [routerLink]="['/recipes', r.id, 'view']">
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
  `,
})
export class RecipeCardsComponent {
  readonly recipes = input.required<RecipeSummary[]>();

  protected thumb(r: RecipeSummary): string | null {
    return mediaUrl(r.coverThumbUrl);
  }

  protected badge(r: RecipeSummary): 'draft' | 'private' | 'public' {
    if (r.status === 'DRAFT') return 'draft';
    return r.visibility === 'PUBLIC' ? 'public' : 'private';
  }
}
