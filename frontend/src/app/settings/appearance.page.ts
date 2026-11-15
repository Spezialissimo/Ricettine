import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { THEMES, Theme, ThemeService } from '../core/theme';

/** Settings > Appearance: System (follow the device), Light or Dark. Applies at once; kept per browser. */
@Component({
  selector: 'app-appearance-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-page.scss',
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.appearanceTitle') }}</h1>
      <fieldset class="card themes">
        <legend>{{ t('settings.themeLabel') }}</legend>
        @for (option of themes; track option) {
          <label class="theme" [attr.data-theme-option]="option">
            <input
              type="radio"
              name="theme"
              [value]="option"
              [checked]="theme.theme() === option"
              (change)="choose(option)"
            />
            <span class="text">
              <span class="name">{{ t('settings.theme.' + option) }}</span>
              <span class="hint">{{ t('settings.theme.' + option + 'Hint') }}</span>
            </span>
          </label>
        }
        <p class="hint">{{ t('settings.themeNote') }}</p>
      </fieldset>
    </ng-container>
  `,
  styles: `
    @use '../../styles/tokens' as t;

    .themes {
      margin: 0;
    }
    legend {
      font-weight: 600;
      padding: 0 t.$space-1;
    }
    label.theme {
      @include t.touch-target;
      display: flex;
      align-items: center;
      gap: t.$space-3;
      margin: 0;
      padding: t.$space-2 t.$space-3;
      border: 1px solid var(--border);
      border-radius: t.$radius;
      font-weight: 400;
      cursor: pointer;
    }
    label.theme + label.theme {
      margin-top: t.$space-2;
    }
    label.theme:has(input:checked) {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    input[type='radio'] {
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--accent);
    }
    .text {
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: 600;
    }
    p.hint {
      margin: t.$space-3 0 0;
    }
  `,
})
export class AppearancePage {
  protected readonly theme = inject(ThemeService);
  protected readonly themes = THEMES;

  protected choose(option: Theme): void {
    this.theme.set(option);
  }
}
