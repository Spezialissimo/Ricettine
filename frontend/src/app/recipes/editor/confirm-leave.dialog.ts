import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { uid } from './editor-sheet';

/** "Leave without this photo?" (an upload in flight or failed). Closes with `true` to leave. */
@Component({
  selector: 'app-confirm-leave-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sheet.scss',
  styles: `
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .primary { font-weight: 700; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('editor.leaveConfirm.title') }}</h2>
      <p class="hint">{{ t('editor.leaveConfirm.body') }}</p>
      <div class="actions">
        <button type="button" class="primary" (click)="ref.close(false)">{{ t('editor.leaveConfirm.stay') }}</button>
        <button type="button" (click)="ref.close(true)">{{ t('editor.leaveConfirm.leave') }}</button>
      </div>
    </ng-container>
  `,
})
export class ConfirmLeaveDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly titleId = uid('leave-title');
}
