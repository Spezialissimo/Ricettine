import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { uid } from '../recipes/editor/editor-sheet';

/** "Reset the share link?" Closes with `true` on confirm. */
@Component({
  selector: 'app-confirm-reset-cookbook-link-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../recipes/editor/sheet.scss',
  styles: `
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .danger { background: #b3261e; border-color: #b3261e; color: #fff; font-weight: 700; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('cookbooks.resetLinkConfirm.title') }}</h2>
      <p class="hint">{{ t('cookbooks.resetLinkConfirm.body') }}</p>
      <div class="actions">
        <button type="button" (click)="ref.close(false)">{{ t('common.cancel') }}</button>
        <button type="button" class="danger" (click)="ref.close(true)">{{ t('cookbooks.resetLinkConfirm.confirm') }}</button>
      </div>
    </ng-container>
  `,
})
export class ConfirmResetCookbookLinkDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly titleId = uid('cb-reset-title');
}
