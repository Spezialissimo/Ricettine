import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { mediaUrl } from '../core/media';
import { CookbookSummary } from './cookbook.model';

/** The user's cookbooks (owned and co-authored) as cards: a grid on desktop, a list on the phone. */
@Component({
  selector: 'app-cookbook-cards',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ul class="grid" *transloco="let t">
      @for (b of cookbooks(); track b.id) {
        <li>
          <a class="cookbook" [routerLink]="['/cookbooks', b.id]">
            @if (mediaUrl(b.coverThumbUrl); as src) {
              <img class="cover-thumb" [src]="src" alt="" loading="lazy" />
            }
            <span class="name">{{ b.name }}</span>
            <span class="count">{{
              t(b.recipeCount === 1 ? 'cookbooks.recipeCountOne' : 'cookbooks.recipeCountOther', {
                count: b.recipeCount,
              })
            }}</span>
            <span class="badges">
              <span class="badge" [attr.data-badge]="b.role">{{
                t(b.role === 'OWNER' ? 'cookbooks.roleOwner' : 'cookbooks.roleAuthor')
              }}</span>
              <span class="badge" [attr.data-badge]="b.visibility">{{
                t('cookbooks.visibility.' + b.visibility)
              }}</span>
            </span>
          </a>
        </li>
      }
    </ul>
  `,
})
export class CookbookCardsComponent {
  readonly cookbooks = input.required<CookbookSummary[]>();
  protected readonly mediaUrl = mediaUrl;
}
