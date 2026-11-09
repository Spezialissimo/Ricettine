import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { uid } from '../../shared/sheet';
import { MAX_SOURCE } from '../recipe-limits';

/** Source: free text (a link, a book, a person). Blank means no source. */
@Component({
  selector: 'app-source-sheet',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../shared/sheet.scss',
  template: `
    <ng-container *transloco="let t">
      <h2>{{ t('editor.sourceSheet.title') }}</h2>
      <p class="hint" [id]="hintId">{{ t('editor.sourceSheet.hint') }}</p>
      <label [for]="inputId">{{ t('editor.sourceSheet.label') }}</label>
      <input type="text" [id]="inputId" [attr.aria-describedby]="hintId" [maxLength]="max" [value]="source()"
        (input)="set($any($event.target).value)" />
      <button type="button" class="done" (click)="ref.close()">{{ t('editor.sheetDone') }}</button>
    </ng-container>
  `,
})
export class SourceSheetComponent {
  private readonly store = inject(EditorStore);
  protected readonly ref = inject(DialogRef);
  protected readonly inputId = uid('source');
  protected readonly hintId = uid('source-hint');
  protected readonly max = MAX_SOURCE;
  protected readonly source = computed(() => this.store.recipe().source ?? '');

  set(value: string): void {
    const source = value.trim() ? value : null;
    this.store.update((r) => ({ ...r, source }));
  }
}
