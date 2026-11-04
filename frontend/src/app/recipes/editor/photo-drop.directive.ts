import { Directive, ElementRef, inject, output, signal } from '@angular/core';
import { photoProblem } from './photo-picker.component';

/**
 * Makes an element a drop target for one image file. Highlights (class `drop-over`, a dashed outline)
 * while files are dragged over it. Several dropped files: the first is used. Non-images and files over
 * 15 MB are `rejected` with an i18n error key.
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
  readonly rejected = output<string>();
  protected readonly over = signal(false);

  private hasFiles(ev: DragEvent): boolean {
    return Array.from(ev.dataTransfer?.types ?? []).includes('Files');
  }

  protected onDrag(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    this.over.set(true);
  }

  protected onLeave(ev: DragEvent): void {
    if (!this.host.nativeElement.contains(ev.relatedTarget as Node | null)) this.over.set(false);
  }

  protected onDrop(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();
    this.over.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) this.rejected.emit(problem);
    else this.dropped.emit(file);
  }
}
