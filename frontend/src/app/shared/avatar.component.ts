import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { mediaUrl } from '../core/media';

/**
 * A person's avatar: their photo, or a circle with the first letter of their name when they have none.
 * Decorative by default (the name is always shown next to it); pass `alt` where the photo carries meaning.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      border-radius: 50%;
      overflow: hidden;
      background: var(--avatar-bg, var(--border));
      color: var(--avatar-ink, var(--ink));
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: var(--avatar-bg, var(--border));
    }
    .initial {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }
  `,
  template: `
    @if (src(); as s) {
      <img [src]="s" [alt]="alt()" />
    } @else {
      <span class="initial" aria-hidden="true">{{ initial() }}</span>
    }
  `,
})
export class AvatarComponent {
  readonly name = input<string | null | undefined>('');
  readonly avatarUrl = input<string | null | undefined>(null);
  /** Diameter in px. */
  readonly size = input(32);
  readonly alt = input('');

  protected readonly src = computed(() => mediaUrl(this.avatarUrl()));
  protected readonly initial = computed(
    () => [...(this.name() ?? '').trim()][0]?.toUpperCase() ?? '?',
  );
}
