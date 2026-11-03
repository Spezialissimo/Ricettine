import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../../core/api-error';
import { RecipeInput, Visibility } from '../recipe.model';
import { ConfirmDeleteDialog } from './confirm-delete.dialog';
import { DetailChipsComponent } from './detail-chips.component';
import { EditorStore, conflictText } from './editor-store';
import { openEditorSheet } from './editor-sheet';

export const MAX_TITLE = 200;
export const MAX_NOTES = 10_000;
const FIELD_CODES = ['required', 'too_long', 'out_of_range', 'too_many', 'invalid', 'invalid_unit'];

/** i18n key for a server field code (`fields` of validation_failed / recipe_incomplete). */
export const fieldErrorKey = (code: string) => `editor.field.${FIELD_CODES.includes(code) ? code : 'invalid'}`;

/**
 * The recipe editor. One DOM for both layouts (CSS at $bp-desktop): two columns on desktop (details,
 * ingredients and notes left; steps right; no bottom bar), a single column with a fixed bottom bar on
 * the phone. Ingredients and steps editors and Publish arrive in Task 8, photos in Task 10.
 */
@Component({
  selector: 'app-recipe-editor-page',
  imports: [TranslocoDirective, DetailChipsComponent, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  providers: [EditorStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipe-editor.page.scss',
  template: `
    <ng-container *transloco="let t">
      @if (store.loadError(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
      } @else if (!store.loaded()) {
        <p class="loading" role="status">{{ t('editor.loading') }}</p>
      } @else {
        @let r = store.recipe();
        <header class="editor-header">
          <button type="button" class="btn back" [disabled]="busy()" (click)="done()">{{ t('editor.done') }}</button>
          <span class="state">{{ t('recipes.status.' + badge()) }}</span>
          <span class="save-status" role="status" [attr.data-status]="store.status()">{{
            store.status() === 'idle' ? '' : t('editor.status.' + store.status())
          }}</span>
          <span class="spacer"></span>
          @if (store.server()?.status === 'DRAFT') {
            <button type="button" class="btn primary publish" disabled>{{ t('editor.publish') }}</button>
          }
          <button type="button" class="btn more" [attr.aria-label]="t('editor.more')" [disabled]="busy()"
            [cdkMenuTriggerFor]="menu">⋯</button>
          <ng-template #menu>
            <div class="menu" cdkMenu>
              <button type="button" class="menu-item danger" cdkMenuItem (cdkMenuItemTriggered)="confirmDelete()">
                {{ t('editor.delete') }}
              </button>
            </div>
          </ng-template>
        </header>

        @if (store.status() === 'conflict') {
          <section class="conflict" role="alert">
            <p>{{ t('editor.conflict') }}</p>
            <label for="conflict-copy">{{ t('editor.conflictCopy') }}</label>
            <textarea id="conflict-copy" readonly rows="6" [value]="conflictCopy()"></textarea>
            <button type="button" class="btn primary" (click)="loadLatest()">{{ t('editor.loadLatest') }}</button>
          </section>
        }
        @if (store.saveError() ?? actionError(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
        }

        <div class="cols">
          <div class="col-left">
            <div class="cover">{{ t('editor.cover') }}</div>
            <div class="title-field">
              <label for="recipe-title">{{ t('editor.title') }}</label>
              <input id="recipe-title" type="text" [maxLength]="maxTitle" [placeholder]="t('editor.titlePlaceholder')"
                [value]="r.title" [attr.aria-invalid]="!!titleError()"
                [attr.aria-describedby]="titleError() ? 'recipe-title-error' : null"
                (input)="set('title', $any($event.target).value)" />
              @if (titleError(); as code) {
                <p id="recipe-title-error" class="field-error">{{ t(fieldKey(code)) }}</p>
              }
            </div>
            <app-detail-chips />
            <fieldset class="visibility">
              <legend>{{ t('editor.visibility') }}</legend>
              @for (v of visibilities; track v) {
                <label class="seg" [attr.data-v]="v">
                  <input type="radio" name="visibility" [value]="v" [checked]="r.visibility === v"
                    (change)="setVisibility(v)" />
                  {{ t(v === 'PRIVATE' ? 'editor.private' : 'editor.public') }}
                </label>
              }
            </fieldset>
            <section class="ingredients" aria-labelledby="ingredients-heading">
              <h2 id="ingredients-heading">{{ t('editor.ingredients') }}</h2>
            </section>
            <div class="notes">
              <h2><label for="recipe-notes">{{ t('editor.notes') }}</label></h2>
              <textarea id="recipe-notes" rows="4" [maxLength]="maxNotes" [value]="r.notes ?? ''"
                (input)="setNotes($any($event.target).value)"></textarea>
            </div>
          </div>
          <div class="col-right">
            <section class="steps" aria-labelledby="steps-heading">
              <h2 id="steps-heading">{{ t('editor.steps') }}</h2>
            </section>
          </div>
        </div>

        <div class="bottom-bar">
          <button type="button" class="btn" disabled>{{ t('editor.photo') }}</button>
          <button type="button" class="btn primary" disabled>{{ t('editor.nextStep') }}</button>
        </div>
      }
    </ng-container>
  `,
})
export class RecipeEditorPage {
  protected readonly store = inject(EditorStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxNotes = MAX_NOTES;
  protected readonly visibilities: readonly Visibility[] = ['PRIVATE', 'PUBLIC'];
  protected readonly fieldKey = fieldErrorKey;
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly titleError = computed(() => this.store.fieldErrors()['title'] ?? null);
  protected readonly conflictCopy = computed(() => conflictText(this.store.recipe()));
  protected readonly badge = computed(() => {
    const s = this.store.server();
    if (!s || s.status === 'DRAFT') return 'draft';
    return s.visibility === 'PUBLIC' ? 'public' : 'private';
  });

  constructor() {
    void this.store.load(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');
  }

  protected set<K extends 'title'>(key: K, value: RecipeInput[K]): void {
    this.store.update((r) => ({ ...r, [key]: value }));
  }

  protected setNotes(value: string): void {
    this.store.update((r) => ({ ...r, notes: value === '' ? null : value }));
  }

  protected setVisibility(visibility: Visibility): void {
    this.store.update((r) => ({ ...r, visibility }));
  }

  /**
   * Done: an untouched new draft (still empty on the server at our version) is deleted; otherwise send
   * pending changes and leave once they are saved. Shares the `busy` guard with Delete.
   */
  async done(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      if (!(await this.store.removeIfUntouched())) {
        await this.store.flush();
        if (this.store.autosave.dirty()) return; // stay: the status/banner says why, nothing is lost
      }
      await this.router.navigateByUrl('/recipes');
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const ref = openEditorSheet(this.dialog, this.injector, ConfirmDeleteDialog, {
        label: this.i18n.translate('editor.deleteConfirm.title'),
      });
      if ((await firstValueFrom(ref.closed, { defaultValue: undefined })) !== true) return;
      await this.store.remove();
      await this.router.navigateByUrl('/recipes');
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }

  async loadLatest(): Promise<void> {
    this.actionError.set(null);
    try {
      await this.store.loadLatest();
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    }
  }
}
