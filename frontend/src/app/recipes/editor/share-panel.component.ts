import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../../core/api-error';
import { AddToCookbookDialog } from '../../cookbooks/add-to-cookbook.dialog';
import { CopyLinkComponent } from '../../shared/copy-link.component';
import { ConfirmResetLinkDialog } from './confirm-reset-link.dialog';
import { EditorStore } from './editor-store';
import { openEditorSheet } from './editor-sheet';

/** The share link of a published recipe with Copy/Share and a confirmed "Reset link"; drafts are told to publish first. */
@Component({
  selector: 'app-share-panel',
  imports: [TranslocoDirective, CopyLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../../styles/tokens' as t;
    :host { display: block; }
    h2 { margin: 0 0 t.$space-2; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: t.$muted; font-weight: 600; }
    .hint { margin: 0; color: t.$muted; }
    .alert { color: #b3261e; }
    .reset { @include t.touch-target; margin-top: t.$space-2; padding: 0 t.$space-4; border: 1px solid t.$border;
      border-radius: 10px; background: t.$bg; color: t.$ink; font-weight: 600; cursor: pointer; }
    .reset:disabled { opacity: 0.5; cursor: default; }
    .reset-done { margin: t.$space-2 0 0; color: t.$muted; }
    .reset-done:empty { margin: 0; }
  `,
  template: `
    <section *transloco="let t" aria-labelledby="share-heading">
      <h2 id="share-heading">{{ t('editor.shareTitle') }}</h2>
      @if (store.server(); as s) {
        @if (s.status === 'PUBLISHED' && s.shareUrl) {
          <app-copy-link [url]="s.shareUrl" />
          <button type="button" class="reset" [disabled]="busy() || conflict()" (click)="reset()"
            [attr.aria-describedby]="conflict() ? 'reset-conflict-hint' : null">{{ t('editor.resetLink') }}</button>
          @if (conflict()) { <p class="hint" id="reset-conflict-hint">{{ t('editor.resetLinkLoadLatest') }}</p> }
          <p class="reset-done" role="status">@if (done()) { {{ t('editor.linkReset') }} }</p>
          @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
        } @else {
          <p class="hint">{{ t('editor.publishToShare') }}</p>
        }
        @if (s.status === 'PUBLISHED') {
          <button type="button" class="reset" (click)="addToCookbook(s.id)">{{ t('cookbooks.addToCookbook') }}</button>
        } @else {
          <p class="hint">{{ t('cookbooks.publishFirst') }}</p>
        }
      }
    </section>
  `,
})
export class SharePanelComponent {
  protected readonly store = inject(EditorStore);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** True after a successful reset, announced through the always-present status line. */
  protected readonly done = signal(false);
  /** A conflict blocks the reset: its version would be stale; Load latest first. */
  protected readonly conflict = computed(() => this.store.status() === 'conflict');

  protected addToCookbook(recipeId: string): void {
    openEditorSheet(this.dialog, this.injector, AddToCookbookDialog, {
      label: this.i18n.translate('cookbooks.addToCookbook'),
      data: { ref: { recipeId } },
    });
  }

  async reset(): Promise<void> {
    if (this.busy() || this.conflict()) return;
    this.busy.set(true);
    this.error.set(null);
    this.done.set(false);
    try {
      const ref = openEditorSheet(this.dialog, this.injector, ConfirmResetLinkDialog, {
        label: this.i18n.translate('editor.resetLinkConfirm.title'),
      });
      if ((await firstValueFrom(ref.closed, { defaultValue: undefined })) !== true) return;
      this.done.set((await this.store.resetLink()) === 'reset');
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
