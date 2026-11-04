import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { uid } from './editor-sheet';

/** "Reset the share link?" Closes with `true` on confirm. */
@Component({
  selector: 'app-confirm-reset-link-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sheet.scss',
  styles: `
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .danger { background: #b3261e; border-color: #b3261e; color: #fff; font-weight: 700; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('editor.resetLinkConfirm.title') }}</h2>
      <p class="hint">{{ t('editor.resetLinkConfirm.body') }}</p>
      <div class="actions">
        <button type="button" (click)="ref.close(false)">{{ t('common.cancel') }}</button>
        <button type="button" class="danger" (click)="ref.close(true)">{{ t('editor.resetLinkConfirm.confirm') }}</button>
      </div>
    </ng-container>
  `,
})
export class ConfirmResetLinkDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly titleId = uid('reset-title');
}
