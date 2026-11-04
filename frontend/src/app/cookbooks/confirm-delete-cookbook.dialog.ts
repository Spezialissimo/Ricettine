import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { uid } from '../recipes/editor/editor-sheet';

/** "Delete this cookbook?" naming it. Closes with `true` on confirm. */
@Component({
  selector: 'app-confirm-delete-cookbook-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../recipes/editor/sheet.scss',
  styles: `
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .danger { background: #b3261e; border-color: #b3261e; color: #fff; font-weight: 700; }
    .hint { overflow-wrap: anywhere; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('cookbooks.deleteConfirm.title') }}</h2>
      <p class="hint">{{ t('cookbooks.deleteConfirm.body', { name: data.name }) }}</p>
      <div class="actions">
        <button type="button" (click)="ref.close(false)">{{ t('common.cancel') }}</button>
        <button type="button" class="danger" (click)="ref.close(true)">{{ t('cookbooks.deleteConfirm.confirm') }}</button>
      </div>
    </ng-container>
  `,
})
export class ConfirmDeleteCookbookDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<{ name: string }>(DIALOG_DATA);
  protected readonly titleId = uid('delete-cookbook-title');
}
