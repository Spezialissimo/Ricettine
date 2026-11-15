import { Directive, ElementRef, inject, output, signal } from '@angular/core';
import { photoProblem } from './photo-picker.component';
import {
  carriesFiles,
  carriesLinkOnly,
  dataUrlToFile,
  draggedImageUrl,
  draggedImgSrc,
  isTextField,
  isWebUrl,
  transferFiles,
} from './photo-transfer';

/**
 * Makes an element a drop target for one photo. Highlights (class `drop-over`, a dashed outline) while files
 * or an image from a web page are dragged over it. Several dropped files: the first is used. An image dragged
 * out of a web page arrives as its address: an embedded (`data:`) image is read here and `dropped` as a file,
 * a web address is emitted as `droppedUrl` for the server to download. A drop is never silent: anything
 * unusable is `rejected` with an i18n error key.
 */
@Directive({
  selector: '[appPhotoDrop]',
  host: {
    '[class.drop-over]': 'over()',
    '(dragenter)': 'onDrag($event)',
    '(dragover)': 'onDrag($event)',
    '(dragleave)': 'onLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class PhotoDropDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly dropped = output<File>();
  readonly droppedUrl = output<string>();
  readonly rejected = output<string>();
  protected readonly over = signal(false);

  /**
   * Files always. Something from a web page: anywhere but a text field; over a text field (most of a step)
   * only a drag with an address (an image or a link; a plain text selection has none) - the drop then
   * decides: an image becomes the photo, a bare link is typed into the field as before.
   */
  private accepts(ev: DragEvent): boolean {
    if (carriesFiles(ev.dataTransfer)) return true;
    if (!carriesLinkOnly(ev.dataTransfer)) return false;
    return (
      !isTextField(ev.target) || Array.from(ev.dataTransfer?.types ?? []).includes('text/uri-list')
    );
  }

  protected onDrag(ev: DragEvent): void {
    if (!this.accepts(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    this.over.set(true);
  }

  protected onLeave(ev: DragEvent): void {
    // relatedTarget is null in some browsers when moving onto a child: only a real exit clears the outline
    const to = ev.relatedTarget as Node | null;
    if (to && this.host.nativeElement.contains(to)) return;
    const r = this.host.nativeElement.getBoundingClientRect();
    if (
      !to &&
      ev.clientX > r.left &&
      ev.clientX < r.right &&
      ev.clientY > r.top &&
      ev.clientY < r.bottom
    )
      return;
    this.over.set(false);
  }

  protected onDrop(ev: DragEvent): void {
    if (!this.accepts(ev)) return;
    ev.preventDefault();
    this.over.set(false);
    const field = isTextField(ev.target) ? (ev.target as Element).closest('input, textarea') : null;
    if (field && !carriesFiles(ev.dataTransfer) && !draggedImgSrc(ev.dataTransfer)) {
      typeInto(field as HTMLInputElement | HTMLTextAreaElement, ev.dataTransfer);
      return;
    }
    const file = transferFiles(ev.dataTransfer)[0] ?? this.fromPage(ev.dataTransfer);
    if (typeof file === 'string') {
      this.droppedUrl.emit(file);
      return;
    }
    if (!file) {
      this.rejected.emit(
        carriesLinkOnly(ev.dataTransfer) ? 'errors.photo_from_link' : 'errors.photo_unreadable',
      );
      return;
    }
    const problem = photoProblem(file);
    if (problem) this.rejected.emit(problem);
    else this.dropped.emit(file);
  }

  /** An image dragged out of a web page: a file for an embedded image, else its web address, else nothing. */
  private fromPage(dt: DataTransfer | null): File | string | undefined {
    if (!carriesLinkOnly(dt) && carriesFiles(dt)) return undefined;
    const url = draggedImageUrl(dt);
    if (!url) return undefined;
    return dataUrlToFile(url) ?? (isWebUrl(url) ? url : undefined);
  }
}

/** A bare link dropped on a text field: inserted at the caret, as the browser would have done. */
function typeInto(field: HTMLInputElement | HTMLTextAreaElement, dt: DataTransfer | null): void {
  const text = dt?.getData('text/plain') || dt?.getData('text/uri-list').split(/\r?\n/)[0] || '';
  if (!text) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(text, start, end, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
