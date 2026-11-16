import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { mediaUrl } from '../../core/media';
import { EditorStore, PhotoSlot } from './editor-store';
import { PhotoPickerComponent } from './photo-picker.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * One photo place (the cover or a step): the image (local preview while uploading, then the server
 * thumb; a photo given by web address shows "Uploading…" in place of the picker), the "Uploading…" label or error (a failed upload keeps its preview and offers Retry), and Add photo / Replace / Remove with names that say where.
 */
@Component({
  selector: 'app-photo-slot',
  imports: [TranslocoDirective, PhotoPickerComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }
    .frame {
      position: relative;
      display: inline-block;
      justify-self: start;
      max-width: 100%;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 220px;
      border-radius: 10px;
    }
    img.photo-preview {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .frame:not(.has-thumb) img.photo-preview {
      position: static;
      width: auto;
      height: auto;
    }
    .label {
      position: absolute;
      left: 6px;
      bottom: 6px;
      padding: 2px 8px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.6);
      color: var(--on-accent);
      font-size: 0.8rem;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    // Replace and Remove: over the darkened photo, centred, in the app's usual white icon buttons. Shown on
    // hover or keyboard focus; on touch screens (no hover) a tap on the photo shows or hides them.
    .on-photo-actions {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.45);
      color: var(--ink);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .frame.revealed .on-photo-actions,
    .frame:focus-within .on-photo-actions {
      opacity: 1;
      pointer-events: auto;
    }
    @media (hover: hover) {
      .frame:hover .on-photo-actions {
        opacity: 1;
        pointer-events: auto;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .on-photo-actions {
        transition: none;
      }
    }
    // while a photo is dragged over the page or onto this place: the image says it will be replaced
    .drop-replace {
      display: none;
      position: absolute;
      inset: 0;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      font-weight: 700;
      pointer-events: none;
    }
    :host-context(.drop-over) .drop-replace,
    :host-context(.dragging-files) .drop-replace {
      display: flex;
    }
    .btn {
      min-height: 44px;
      min-width: 44px;
      padding: 0 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: var(--danger);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .status {
      margin: 0;
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .pending {
      margin: 0;
      min-height: 44px;
      display: flex;
      align-items: center;
      color: var(--muted);
    }
    .error {
      margin: 0;
      color: var(--danger);
      font-size: 0.85rem;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      @let up = upload();
      @let thumb = photo();
      @if (thumb || up?.preview) {
        <div
          class="frame"
          [class.has-thumb]="!!thumb"
          [class.revealed]="revealed()"
          (click)="toggleActions($event)"
        >
          @if (thumb) {
            <img
              class="photo-thumb"
              [src]="thumbSrc()"
              [alt]="alt(t)"
              (load)="store.previewLoaded(slot())"
            />
          }
          @if (up?.preview; as p) {
            <img class="photo-preview" [src]="p" alt="" aria-hidden="true" />
          }
          @if (up?.status === 'uploading') {
            <span class="label" aria-hidden="true">{{ t('editor.uploading') }}</span>
          } @else {
            <span class="drop-replace" aria-hidden="true">{{ t('editor.dropToReplace') }}</span>
            <div class="on-photo-actions">
              <app-photo-picker
                class="icon"
                [capture]="capture()"
                iconName="replace"
                [label]="t('editor.replace')"
                [ariaLabel]="pickerName(t)"
                (picked)="pick($event)"
                (rejected)="store.rejectPhoto(slot(), $event)"
              />
              <button
                type="button"
                class="icon-btn danger remove"
                [attr.aria-label]="removeName(t)"
                [attr.title]="removeName(t)"
                (click)="store.removePhoto(slot())"
              >
                <app-icon name="trash" />
              </button>
            </div>
          }
        </div>
      }
      <!-- persistent live region: its text changes, so screen readers announce it reliably -->
      <p class="status" role="status">
        {{ up?.status === 'uploading' ? t('editor.uploading') : '' }}
      </p>
      @if (up?.error; as e) {
        <p class="error" role="alert">{{ t(e) }}</p>
      }
      <div class="actions">
        @if (up?.status === 'failed' && (up?.file || up?.url)) {
          <button
            type="button"
            class="btn retry"
            [attr.aria-label]="retryName(t)"
            (click)="retry()"
          >
            {{ t('editor.retry') }}
          </button>
        }
        @if (!(thumb || up?.preview) && up?.status === 'uploading') {
          <!-- a photo given by its web address has no preview while the server downloads it -->
          <p class="pending" aria-hidden="true">{{ t('editor.uploading') }}</p>
        } @else if (!(thumb || up?.preview)) {
          @if (isCover()) {
            <app-photo-picker
              [capture]="capture()"
              [label]="t('editor.cover')"
              [ariaLabel]="pickerName(t)"
              (picked)="pick($event)"
              (rejected)="store.rejectPhoto(slot(), $event)"
            />
          } @else {
            <app-photo-picker
              class="icon"
              [capture]="capture()"
              iconName="camera"
              [label]="t('editor.addPhoto')"
              [ariaLabel]="pickerName(t)"
              (picked)="pick($event)"
              (rejected)="store.rejectPhoto(slot(), $event)"
            />
          }
        }
      </div>
    </ng-container>
  `,
})
export class PhotoSlotComponent {
  protected readonly store = inject(EditorStore);
  readonly slot = input.required<PhotoSlot>();
  readonly capture = input(false);

  protected readonly isCover = computed(() => this.slot() === 'cover');
  protected readonly upload = computed(() =>
    this.store.uploads().find((u) => u.slot === this.slot()),
  );
  protected readonly photo = computed(() => {
    const r = this.store.recipe();
    const s = this.slot();
    return this.store.photoOf(s === 'cover' ? r.coverMediaId : (r.steps[s]?.photoMediaId ?? null));
  });
  protected readonly thumbSrc = computed(() => mediaUrl(this.photo()?.thumbUrl));
  private readonly n = computed(() => (this.slot() === 'cover' ? 0 : (this.slot() as number) + 1));

  protected alt(t: (k: string, p?: object) => string): string {
    return this.isCover() ? t('editor.coverAlt') : t('editor.stepPhotoAlt', { n: this.n() });
  }

  protected pickerName(t: (k: string, p?: object) => string): string {
    const has = !!(this.photo() || this.upload()?.preview);
    if (this.isCover()) return t(has ? 'editor.replaceCover' : 'editor.cover');
    return t(has ? 'editor.replaceStepPhoto' : 'editor.addStepPhoto', { n: this.n() });
  }

  protected removeName(t: (k: string, p?: object) => string): string {
    return this.isCover() ? t('editor.removeCover') : t('editor.removeStepPhoto', { n: this.n() });
  }

  protected retryName(t: (k: string, p?: object) => string): string {
    return this.isCover()
      ? t('editor.retryCoverUpload')
      : t('editor.retryStepUpload', { n: this.n() });
  }

  /** Touch screens have no hover: a tap on the photo itself shows or hides Replace and Remove. */
  protected readonly revealed = signal(false);
  protected toggleActions(ev: MouseEvent): void {
    if ((ev.target as Element).closest('button')) return;
    this.revealed.update((v) => !v);
  }

  protected retry(): void {
    void this.store.retryUpload(this.slot());
  }

  protected pick(file: File): void {
    void this.store.uploadPhoto(this.slot(), file);
  }
}
