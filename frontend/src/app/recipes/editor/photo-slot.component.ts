import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { mediaUrl } from '../../core/media';
import { EditorStore, PhotoSlot } from './editor-store';
import { PhotoPickerComponent } from './photo-picker.component';

/**
 * One photo place (the cover or a step): the image (local preview while uploading, then the server
 * thumb), the "Uploading…" label or error, and Add photo / Replace / Remove with names that say where.
 */
@Component({
  selector: 'app-photo-slot',
  imports: [TranslocoDirective, PhotoPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: grid; gap: 8px; }
    .frame { position: relative; display: inline-block; justify-self: start; max-width: 100%; }
    img { display: block; max-width: 100%; max-height: 220px; border-radius: 10px; }
    img.photo-preview { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .frame:not(.has-thumb) img.photo-preview { position: static; width: auto; height: auto; }
    .label { position: absolute; left: 6px; bottom: 6px; padding: 2px 8px; border-radius: 8px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 0.8rem; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      min-height: 44px; min-width: 44px; padding: 0 16px; border: 1px solid #e2dcd3; border-radius: 10px; background: #fff;
      color: #b3261e; font: inherit; font-weight: 600; cursor: pointer;
    }
    .status { margin: 0; position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .error { margin: 0; color: #b3261e; font-size: 0.85rem; }
  `,
  template: `
    <ng-container *transloco="let t">
      @let up = upload();
      @let thumb = photo();
      @if (thumb || up?.preview) {
        <div class="frame" [class.has-thumb]="!!thumb">
          @if (thumb) {
            <img class="photo-thumb" [src]="thumbSrc()" [alt]="alt(t)" (load)="store.previewLoaded(slot())" />
          }
          @if (up?.preview; as p) {
            <img class="photo-preview" [src]="p" alt="" aria-hidden="true" />
          }
          @if (up?.status === 'uploading') {
            <span class="label" aria-hidden="true">{{ t('editor.uploading') }}</span>
          }
        </div>
      }
      <!-- persistent live region: its text changes, so screen readers announce it reliably -->
      <p class="status" role="status">{{ up?.status === 'uploading' ? t('editor.uploading') : '' }}</p>
      @if (up?.error; as e) {
        <p class="error" role="alert">{{ t(e) }}</p>
      }
      <div class="actions">
        <app-photo-picker [capture]="capture()" [label]="t(thumb || up?.preview ? 'editor.replace' : (isCover() ? 'editor.cover' : 'editor.addPhoto'))"
          [ariaLabel]="pickerName(t)" (picked)="pick($event)" (rejected)="store.rejectPhoto(slot(), $event)" />
        @if (thumb || up?.preview) {
          <button type="button" class="btn" [attr.aria-label]="removeName(t)" (click)="store.removePhoto(slot())">{{ t('editor.remove') }}</button>
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
  protected readonly upload = computed(() => this.store.uploads().find((u) => u.slot === this.slot()));
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

  protected pick(file: File): void {
    void this.store.uploadPhoto(this.slot(), file);
  }
}
