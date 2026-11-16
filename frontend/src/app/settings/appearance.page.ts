import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { THEMES, Theme, ThemeService } from '../core/theme';

/** Settings > Appearance: System (follow the device), Light or Dark. Applies at once; kept per browser. */
@Component({
  selector: 'app-appearance-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./settings-page.scss', './choice-list.scss'],
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.appearanceTitle') }}</h1>
      <fieldset class="card choices">
        <legend>{{ t('settings.themeLabel') }}</legend>
        @for (option of themes; track option) {
          <label class="choice theme" [attr.data-theme-option]="option">
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
})
export class AppearancePage {
  protected readonly theme = inject(ThemeService);
  protected readonly themes = THEMES;

  protected choose(option: Theme): void {
    this.theme.set(option);
  }
}
