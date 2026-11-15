import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { errorKeyOf } from '../../core/api-error';
import { confirmSheet } from '../../shared/confirm-dialog.component';
import { CopyLinkComponent } from '../../shared/copy-link.component';

export type ShareRecipeData = {
  url: string;
  /** Only for the author / owner: makes a new link (the old one stops working) and returns it. */
  reset?: () => Promise<string>;
  /** i18n keys; the recipe ones by default (cookbooks pass their own). */
  titleKey?: string;
  hintKey?: string;
  resetKey?: string;
  resetConfirmKey?: string;
  resetDoneKey?: string;
};

/** Share sheet (recipe or cookbook page): the link with Copy / Share, and for the author / owner a confirmed "Reset link". */
@Component({
  selector: 'app-share-recipe-dialog',
  imports: [TranslocoDirective, CopyLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../shared/sheet.scss',
  styles: `
    .reset {
      margin-top: 12px;
      width: 100%;
      color: var(--danger);
    }
    .ok {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .alert {
      color: var(--danger);
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2>{{ t(data.titleKey ?? 'recipes.shareTitle') }}</h2>
      <p class="hint">{{ t(data.hintKey ?? 'recipes.shareHint') }}</p>
      <app-copy-link [url]="url()" />
      @if (data.reset) {
        <button type="button" class="reset" [disabled]="busy()" (click)="reset()">
          {{ t(data.resetKey ?? 'editor.resetLink') }}
        </button>
        <p class="ok" role="status">
          @if (done()) {
            {{ t(data.resetDoneKey ?? 'editor.linkReset') }}
          }
        </p>
        @if (error(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
        }
      }
      <button type="button" class="done" (click)="ref.close()">{{ t('editor.sheetDone') }}</button>
    </ng-container>
  `,
})
export class ShareRecipeDialog {
  protected readonly data = inject<ShareRecipeData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly url = signal(this.data.url);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async reset(): Promise<void> {
    if (this.busy() || !this.data.reset) return;
    const keys = this.data.resetConfirmKey ?? 'editor.resetLinkConfirm';
    const ok = await confirmSheet(this.dialog, this.injector, this.i18n, {
      titleKey: `${keys}.title`,
      bodyKey: `${keys}.body`,
      confirmKey: `${keys}.confirm`,
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.url.set(await this.data.reset());
      this.done.set(true);
    } catch (e) {
      this.error.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }
}
