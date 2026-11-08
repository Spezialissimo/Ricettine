import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** Minus / plus around "Serves N" for scaling a recipe; Reset appears once it differs from the written portions. */
@Component({
  selector: 'app-portions-stepper',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    button {
      min-width: 44px;
      min-height: 44px;
      border: 1px solid var(--border, #ddd);
      border-radius: 10px;
      background: transparent;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: inherit;
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .reset {
      padding: 0 12px;
    }
    [role='status'] {
      min-width: 5.5em;
      text-align: center;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <button
        type="button"
        [attr.aria-label]="t('recipes.scale.fewer')"
        [disabled]="value() <= min()"
        (click)="valueChange.emit(value() - 1)"
      >
        <span aria-hidden="true">−</span>
      </button>
      <span role="status">{{ t('editor.chips.serves', { n: value() }) }}</span>
      <button
        type="button"
        [attr.aria-label]="t('recipes.scale.more')"
        [disabled]="value() >= max()"
        (click)="valueChange.emit(value() + 1)"
      >
        <span aria-hidden="true">+</span>
      </button>
      @if (value() !== written()) {
        <button type="button" class="reset" (click)="valueChange.emit(written())">
          {{ t('recipes.scale.reset') }}
        </button>
      }
    </ng-container>
  `,
})
export class PortionsStepperComponent {
  readonly value = input.required<number>();
  /** The portions the recipe was written for; Reset returns to it. */
  readonly written = input.required<number>();
  readonly min = input(1);
  readonly max = input(100);
  readonly valueChange = output<number>();
}
