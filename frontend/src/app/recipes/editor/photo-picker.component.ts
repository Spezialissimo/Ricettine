import { IconComponent, IconName } from '../../shared/icon.component';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** i18n key of the problem with a photo file the client can see (size, type), or null. Only the server decodes. */
export function photoProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'errors.unsupported_image';
  return file.size > MAX_PHOTO_BYTES ? 'errors.file_too_large' : null;
}

/**
 * A hidden file input opened by an accessible button. `capture` makes a phone open its camera straight
 * away. Emits `picked(file)`, or `rejected(i18nKey)` for a file over 15 MB.
 */
@Component({
  selector: 'app-photo-picker',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
    }
    button {
      min-height: 44px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 0 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    // icon only: a 44 px square, the name in aria-label and the tooltip
    :host(.icon) button {
      width: 44px;
      padding: 0;
    }
    :host(.primary) button {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--on-accent);
    }
  `,
  template: `
    <button
      type="button"
      [attr.aria-label]="ariaLabel() || null"
      [attr.title]="iconName() ? ariaLabel() || label() : null"
      (click)="file.click()"
    >
      @if (iconName(); as n) {
        <app-icon [name]="n" />
      } @else {
        @if (icon()) {
          <span aria-hidden="true">{{ icon() }}&nbsp;</span>
        }
        {{ label() }}
      }
    </button>
    <input
      #file
      type="file"
      hidden
      aria-hidden="true"
      tabindex="-1"
      [accept]="accept"
      [attr.capture]="capture() ? 'environment' : null"
      (change)="onChange(file)"
    />
  `,
})
export class PhotoPickerComponent {
  protected readonly accept = PHOTO_ACCEPT;
  readonly label = input.required<string>();
  readonly ariaLabel = input<string>('');
  /** Decorative emoji before the label, hidden from screen readers. */
  readonly icon = input<string>('');
  /** An SVG icon instead of the text label (add the host class `icon`); the label stays the accessible name. */
  readonly iconName = input<IconName | null>(null);
  readonly capture = input(false);
  readonly picked = output<File>();
  readonly rejected = output<string>();

  protected onChange(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again must fire again
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) this.rejected.emit(problem);
    else this.picked.emit(file);
  }
}
