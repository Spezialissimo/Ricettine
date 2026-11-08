import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { errorKeyOf } from '../core/api-error';
import { openSheet, uid } from '../shared/sheet';
import { CookbookApi } from './cookbook.api';
import { CookbookInput, CookbookSummary, RecipeRef } from './cookbook.model';
import { CookbookFormDialog } from './cookbook-form.dialog';

type Row = { id: string; name: string; state: 'idle' | 'busy' | 'added' | 'already'; error: string | null };

/** Picks a cookbook to add `ref` to (existing recipe, or a recipe seen through its share link). */
@Component({
  selector: 'app-add-to-cookbook-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/sheet.scss',
  styles: `
    ul { list-style: none; margin: 0 0 12px; padding: 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; flex-wrap: wrap; padding: 4px 0; }
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .ok { color: #2e7d32; }
    .alert { color: #b3261e; margin: 0; flex-basis: 100%; font-size: 0.85rem; }
    .actions { display: flex; gap: 8px; justify-content: space-between; }
    .actions button, li button { padding: 0 16px; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('cookbooks.addToCookbook') }}</h2>
      @if (loadError(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
      } @else if (rows(); as list) {
        @if (list.length === 0) { <p class="hint">{{ t('cookbooks.noneYet') }}</p> }
        <ul>
          @for (r of list; track r.id) {
            <li>
              <span class="name">{{ r.name }}</span>
              @if (r.state === 'added') {
                <span class="ok" role="status">{{ t('cookbooks.added') }}</span>
              } @else if (r.state === 'already') {
                <span role="status">{{ t('cookbooks.alreadyIn') }}</span>
              } @else {
                <button type="button" [disabled]="r.state === 'busy'" [attr.aria-label]="t('cookbooks.addTo', { name: r.name })"
                  (click)="add(r.id)">{{ t('cookbooks.add') }}</button>
              }
              @if (r.error; as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
            </li>
          }
        </ul>
      } @else {
        <p class="hint" role="status">{{ t('cookbooks.loading') }}</p>
      }
      <div class="actions">
        <button type="button" class="new" (click)="createNew()">{{ t('cookbooks.new') }}</button>
        <button type="button" (click)="ref.close()">{{ t('cookbooks.close') }}</button>
      </div>
    </ng-container>
  `,
})
export class AddToCookbookDialog {
  protected readonly ref = inject<DialogRef<unknown>>(DialogRef);
  private readonly data = inject<{ ref: RecipeRef }>(DIALOG_DATA);
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly titleId = uid('add-cookbook-title');
  protected readonly rows = signal<Row[] | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const mine = await this.api.mine();
      this.rows.set(mine.map((c: CookbookSummary) => ({ id: c.id, name: c.name, state: 'idle', error: null })));
    } catch (e) {
      this.loadError.set(errorKeyOf(e));
    }
  }

  private patchRow(id: string, over: Partial<Row>): void {
    this.rows.update((rs) => rs?.map((r) => (r.id === id ? { ...r, ...over } : r)) ?? null);
  }

  protected async add(id: string): Promise<void> {
    this.patchRow(id, { state: 'busy', error: null });
    try {
      const { created } = await this.api.addRecipe(id, this.data.ref);
      this.patchRow(id, { state: created ? 'added' : 'already' });
    } catch (e) {
      this.patchRow(id, { state: 'idle', error: errorKeyOf(e) });
    }
  }

  /** Creates a cookbook, then adds the recipe to it; the form stays open if either step fails. */
  protected async createNew(): Promise<void> {
    const state: { made: { id: string; name: string } | null } = { made: null };
    const result = await openSheet(this.dialog, this.injector, CookbookFormDialog, {
      label: this.i18n.translate('cookbooks.newTitle'),
      data: {
        submit: async (input: CookbookInput) => {
          state.made ??= await this.api.create(input);
          await this.api.addRecipe(state.made.id, this.data.ref);
        },
      },
    });
    if (result === true && state.made) {
      const { id, name } = state.made;
      this.rows.update((rs) => [{ id, name, state: 'added', error: null }, ...(rs ?? [])]);
    }
  }
}
