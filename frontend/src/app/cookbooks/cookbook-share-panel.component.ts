import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { openEditorSheet } from '../recipes/editor/editor-sheet';
import { CopyLinkComponent } from '../shared/copy-link.component';
import { CookbookApi } from './cookbook.api';
import { Cookbook } from './cookbook.model';
import { ConfirmResetCookbookLinkDialog } from './confirm-reset-cookbook-link.dialog';

/** The cookbook's share link for every member, with a confirmed "Reset link" for the owner only. */
@Component({
  selector: 'app-cookbook-share-panel',
  imports: [TranslocoDirective, CopyLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../styles/tokens' as t;
    :host { display: block; margin: 0 0 t.$space-4; }
    h2 { margin: 0 0 t.$space-2; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: t.$muted; font-weight: 600; }
    .alert { color: #b3261e; }
    .reset { @include t.touch-target; margin-top: t.$space-2; padding: 0 t.$space-4; border: 1px solid t.$border;
      border-radius: 10px; background: t.$bg; color: t.$ink; font: inherit; font-weight: 600; cursor: pointer; }
    .reset:disabled { opacity: 0.5; cursor: default; }
    .reset-done { margin: t.$space-2 0 0; color: t.$muted; }
    .reset-done:empty { margin: 0; }
  `,
  template: `
    @if (book().shareUrl; as url) {
      <section *transloco="let t" aria-labelledby="cb-share-heading">
        <h2 id="cb-share-heading">{{ t('cookbooks.shareTitle') }}</h2>
        <app-copy-link [url]="url" />
        @if (book().role === 'OWNER') {
          <button type="button" class="reset" [disabled]="busy()" (click)="reset()">{{ t('cookbooks.resetLink') }}</button>
        }
        <p class="reset-done" role="status">@if (done()) { {{ t('cookbooks.linkReset') }} }</p>
        @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
      </section>
    }
  `,
})
export class CookbookSharePanelComponent {
  readonly book = input.required<Cookbook>();
  /** The cookbook as returned by the reset (carries the new link). */
  readonly updated = output<Cookbook>();
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async reset(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.done.set(false);
    try {
      const ref = openEditorSheet(this.dialog, this.injector, ConfirmResetCookbookLinkDialog, {
        label: this.i18n.translate('cookbooks.resetLinkConfirm.title'),
      });
      if ((await firstValueFrom(ref.closed, { defaultValue: undefined })) !== true) return;
      this.updated.emit(await this.api.resetLink(this.book().id));
      this.done.set(true);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
