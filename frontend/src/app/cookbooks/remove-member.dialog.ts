import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { uid } from '../shared/sheet';

export type RemoveMemberData = { name: string; self: boolean };

/**
 * "Remove {name}?" (owner) or "Leave {cookbook}?" (author), with "also remove the recipes added"
 * unchecked by default. Closes with `{ removeRecipes }` on confirm, `false` on cancel.
 */
@Component({
  selector: 'app-remove-member-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/sheet.scss',
  styles: `
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .actions button {
      padding: 0 16px;
    }
    .danger {
      background: #b3261e;
      border-color: #b3261e;
      color: #fff;
      font-weight: 700;
    }
    .hint {
      overflow-wrap: anywhere;
    }
    label.check {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      margin: 0 0 12px;
    }
    label.check input {
      width: 24px;
      height: 24px;
      flex: none;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t(data.self ? 'cookbooks.leave' : 'cookbooks.removeMember') }}</h2>
      <p class="hint">
        {{
          t(data.self ? 'cookbooks.leaveConfirm' : 'cookbooks.removeConfirm', { name: data.name })
        }}
      </p>
      <label class="check">
        <input type="checkbox" #also />
        <span>{{
          t(data.self ? 'cookbooks.alsoRemoveMyRecipes' : 'cookbooks.alsoRemoveRecipes')
        }}</span>
      </label>
      <div class="actions">
        <button type="button" (click)="ref.close(false)">{{ t('common.cancel') }}</button>
        <button type="button" class="danger" (click)="ref.close({ removeRecipes: also.checked })">
          {{ t(data.self ? 'cookbooks.leaveConfirmButton' : 'cookbooks.removeMember') }}
        </button>
      </div>
    </ng-container>
  `,
})
export class RemoveMemberDialog {
  protected readonly ref = inject<DialogRef<{ removeRecipes: boolean } | false>>(DialogRef);
  protected readonly data = inject<RemoveMemberData>(DIALOG_DATA);
  protected readonly titleId = uid('remove-member-title');
}
