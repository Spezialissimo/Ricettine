import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { openSheet, uid } from './sheet';

export type ConfirmData = {
  /** i18n keys, so the dialog translates with the active language like the rest of the UI. */
  titleKey: string;
  bodyKey: string;
  params?: Record<string, unknown>;
  confirmKey: string;
  /** Defaults to `common.cancel`. */
  cancelKey?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** Bolds the cancel button instead (the safe choice, e.g. "Stay"). */
  cancelPrimary?: boolean;
};

/** A title, a body and Cancel/Confirm. Closes with `true` on confirm, `false` on cancel. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sheet.scss',
  styles: `
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .danger { background: #b3261e; border-color: #b3261e; color: #fff; font-weight: 700; }
    .primary { font-weight: 700; }
    .hint { overflow-wrap: anywhere; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t(data.titleKey) }}</h2>
      <p class="hint">{{ t(data.bodyKey, data.params ?? {}) }}</p>
      <div class="actions">
        <button type="button" [class.primary]="data.cancelPrimary" (click)="ref.close(false)">{{ t(data.cancelKey ?? 'common.cancel') }}</button>
        <button type="button" [class.danger]="data.danger" (click)="ref.close(true)">{{ t(data.confirmKey) }}</button>
      </div>
    </ng-container>
  `,
})
class ConfirmDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmData>(DIALOG_DATA);
  protected readonly titleId = uid('confirm-title');
}

/** Asks for confirmation in a sheet; true only when the user confirmed (Esc and the backdrop say no). */
export async function confirmSheet(dialog: Dialog, injector: Injector, i18n: TranslocoService, data: ConfirmData): Promise<boolean> {
  return (await openSheet<boolean>(dialog, injector, ConfirmDialogComponent, { label: i18n.translate(data.titleKey), data })) === true;
}
