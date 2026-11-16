import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService } from '../core/language';

/**
 * A cookbook's banner, the same on the member page (/cookbooks/:id) and the shared-link page (/c/:token):
 * the cover with the name, a facts line ("3 recipes · by Ann and Bob · Private") and the page's buttons
 * (projected) over its bottom edge on a dark fade; without a cover, the same row in a plain card.
 */
@Component({
  selector: 'app-cookbook-hero',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbook-hero.component.scss',
  template: `
    <section
      *transloco="let t"
      class="book-hero"
      [class.has-cover]="!!coverUrl()"
      aria-labelledby="book-title"
    >
      @if (coverUrl(); as src) {
        <img class="banner" [src]="src" alt="" loading="eager" fetchpriority="high" />
      }
      <div class="hero-row">
        <div class="hero-text">
          <h1 id="book-title">{{ name() }}</h1>
          <p class="facts">
            {{
              t(language.pluralKey('cookbooks.recipeCount', recipeCount()), {
                count: recipeCount(),
              })
            }}
            @if (people(); as names) {
              · {{ t('cookbooks.byNames', { names }) }}
            }
            @if (visibility(); as v) {
              · {{ t('cookbooks.visibility.' + v) }}
            }
          </p>
        </div>
        <div class="actions"><ng-content /></div>
      </div>
    </section>
  `,
})
export class CookbookHeroComponent {
  protected readonly language = inject(LanguageService);
  readonly name = input.required<string>();
  readonly recipeCount = input.required<number>();
  /** "Ann and Bob", already joined; empty for none. */
  readonly people = input('');
  /** Shown to members only (the shared-link page has none). */
  readonly visibility = input<string | null>(null);
  readonly coverUrl = input<string | null>(null);
}
