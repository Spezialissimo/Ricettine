import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AddToCookbookDialog } from '../../cookbooks/add-to-cookbook.dialog';
import { EditorStore } from './editor-store';
import { openSheet } from '../../shared/sheet';

/**
 * Add to cookbook, for a published recipe. A draft shows nothing. Sharing and Reset link live on the recipe
 * page, where every reader can share (owner, Plan 7).
 */
@Component({
  selector: 'app-share-panel',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../../styles/tokens' as t;

    :host {
      display: block;
    }
    .add {
      @include t.touch-target;
      padding: 0 t.$space-4;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg);
      color: var(--ink);
      font-weight: 600;
      cursor: pointer;
    }
  `,
  template: `
    @if (published(); as s) {
      <button *transloco="let t" type="button" class="add" (click)="addToCookbook(s.id)">
        {{ t('cookbooks.addToCookbook') }}
      </button>
    }
  `,
})
export class SharePanelComponent {
  protected readonly store = inject(EditorStore);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  /** The saved recipe, only once it is published. */
  protected readonly published = computed(() => {
    const s = this.store.server();
    return s?.status === 'PUBLISHED' ? s : null;
  });

  protected addToCookbook(recipeId: string): void {
    void openSheet(this.dialog, this.injector, AddToCookbookDialog, {
      label: this.i18n.translate('cookbooks.addToCookbook'),
      data: { ref: { recipeId } },
    });
  }
}
