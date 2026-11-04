import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AppDatePipe } from './app-date.pipe';

/** Shows a one-time link with its expiry, plus Copy and (where supported) Share buttons. */
@Component({
  selector: 'app-copy-link',
  imports: [TranslocoDirective, AppDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../styles/tokens' as t;
    .box { background: t.$surface; border: 1px solid t.$border; border-radius: t.$radius; padding: t.$space-4; }
    .url { display: block; word-break: break-all; font-family: monospace; margin: 0 0 t.$space-2; user-select: all; }
    .expiry { margin: 0 0 t.$space-3; color: t.$muted; font-size: 0.85rem; }
    .row { display: flex; gap: t.$space-2; align-items: center; flex-wrap: wrap; }
    button { @include t.touch-target; padding: 0 t.$space-4; border: 0; border-radius: t.$radius;
      background: t.$accent; color: #fff; font-weight: 600; }
    .ok { color: t.$muted; }
  `,
  template: `
    <div class="box" *transloco="let t">
      <code class="url" data-url>{{ url() }}</code>
      @if (expiresAt(); as exp) {
        <p class="expiry">{{ t('common.expiresOn', { date: (exp | appDate: 'dateTime') }) }}</p>
      }
      <div class="row">
        <button type="button" (click)="copy()">{{ t('common.copy') }}</button>
        @if (canShare) {
          <button type="button" (click)="share()">{{ t('common.share') }}</button>
        }
        @if (copied()) { <span class="ok" role="status">{{ t('common.copied') }}</span> }
      </div>
    </div>
  `,
})
export class CopyLinkComponent {
  readonly url = input.required<string>();
  readonly expiresAt = input<string | null>(null);
  /** The url last copied: "Copied" shows only while that is still the url (a new link starts fresh). */
  private readonly copiedUrl = signal<string | null>(null);
  readonly copied = computed(() => this.copiedUrl() !== null && this.copiedUrl() === this.url());
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async copy(): Promise<void> {
    try {
      const url = this.url();
      await navigator.clipboard.writeText(url);
      this.copiedUrl.set(url);
    } catch {
      this.copiedUrl.set(null); // clipboard unavailable or denied; the URL stays selectable
    }
  }

  async share(): Promise<void> {
    try {
      await navigator.share({ url: this.url() });
    } catch {
      // user cancelled or share failed: nothing to do
    }
  }
}
