import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService } from '../../core/language';

/** One pill "− N servings +" for scaling a recipe; softly filled while it differs from the written number. */
@Component({
  selector: 'app-portions-stepper',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.scaled]': 'value() !== written()' },
  styles: `
    // one pill: − at one end, the count in the middle, + at the other
    :host {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
    }
    // scaled away from the written amount: a soft green fill (no green text)
    :host(.scaled) {
      background: var(--badge-public-bg);
      border-color: var(--accent);
    }
    [role='status'] {
      min-width: 6.5em;
      padding: 0 4px;
      text-align: center;
      font-weight: 600;
      white-space: nowrap;
    }
    button {
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      font: inherit;
      font-size: 1.2rem;
      font-weight: 700;
      cursor: pointer;
      color: var(--ink);
    }
    button:hover:not(:disabled) {
      background: var(--subtle);
    }
    button:disabled {
      opacity: 0.35;
      cursor: default;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <button
        type="button"
        [attr.aria-label]="t('recipes.scale.fewer')"
        [attr.title]="t('recipes.scale.fewer')"
        [disabled]="value() <= min()"
        (click)="valueChange.emit(value() - 1)"
      >
        <span aria-hidden="true">−</span>
      </button>
      <span role="status">{{
        t(language.pluralKey('recipes.servings', value()), { n: value() })
      }}</span>
      <button
        type="button"
        [attr.aria-label]="t('recipes.scale.more')"
        [attr.title]="t('recipes.scale.more')"
        [disabled]="value() >= max()"
        (click)="valueChange.emit(value() + 1)"
      >
        <span aria-hidden="true">+</span>
      </button>
    </ng-container>
  `,
})
export class PortionsStepperComponent {
  protected readonly language = inject(LanguageService);
  readonly value = input.required<number>();
  /** The portions the recipe was written for: any other value shows the pill as scaled. */
  readonly written = input.required<number>();
  readonly min = input(1);
  readonly max = input(100);
  readonly valueChange = output<number>();
}
