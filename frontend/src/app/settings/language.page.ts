import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  LANGUAGE_CHOICES,
  LanguageChoice,
  LanguageService,
  browserLanguage,
} from '../core/language';

/** Settings > Language: System (follow the browser), English or Italiano. Applies at once; kept per browser. */
@Component({
  selector: 'app-language-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./settings-page.scss', './choice-list.scss'],
  template: `
    <ng-container *transloco="let t">
      <h1>{{ t('settings.languageTitle') }}</h1>
      <fieldset class="card choices">
        <legend>{{ t('settings.languageLabel') }}</legend>
        @for (option of choices; track option) {
          <label class="choice" [attr.data-language-option]="option">
            <input
              type="radio"
              name="language"
              [value]="option"
              [checked]="language.choice() === option"
              (change)="language.choose(option)"
            />
            <span class="text">
              @if (option === 'system') {
                <span class="name">{{ t('settings.language.system') }}</span>
                <span class="hint">{{
                  t('settings.language.systemHint', {
                    name: t('settings.language.' + browser),
                  })
                }}</span>
              } @else {
                <!-- each language is named in itself, so lang tells screen readers how to say it -->
                <span class="name" [attr.lang]="option">{{
                  t('settings.language.' + option)
                }}</span>
              }
            </span>
          </label>
        }
        <p class="hint">{{ t('settings.languageNote') }}</p>
      </fieldset>
    </ng-container>
  `,
})
export class LanguagePage {
  protected readonly language = inject(LanguageService);
  protected readonly choices: readonly LanguageChoice[] = LANGUAGE_CHOICES;
  protected readonly browser = browserLanguage();
}
