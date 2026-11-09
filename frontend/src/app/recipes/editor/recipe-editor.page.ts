import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { errorKey, errorKeyOf, fieldErrorKey, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { RecipeInput, Visibility } from '../recipe.model';
import { DetailChipsComponent } from './detail-chips.component';
import { EditorStore, conflictText } from './editor-store';
import { confirmSheet } from '../../shared/confirm-dialog.component';
import { IngredientsEditorComponent } from './ingredients-editor.component';
import { PhotoDropDirective } from './photo-drop.directive';
import { PhotoPickerComponent } from './photo-picker.component';
import { PhotoSlotComponent } from './photo-slot.component';
import { SharePanelComponent } from './share-panel.component';
import { StepsEditorComponent } from './steps-editor.component';
import { countingIngredients, countingSteps } from './completeness';

export const MAX_TITLE = 200;
export const MAX_NOTES = 10_000;

/**
 * The recipe editor. One DOM for both layouts (CSS at $bp-desktop): two columns on desktop (details,
 * ingredients and notes left; steps right; no bottom bar), a single column with a fixed bottom bar on
 * the phone. Ingredients and steps editors and Publish arrive in Task 8, photos in Task 10.
 */
@Component({
  selector: 'app-recipe-editor-page',
  imports: [TranslocoDirective, DetailChipsComponent, IngredientsEditorComponent, StepsEditorComponent, PhotoDropDirective, PhotoPickerComponent, PhotoSlotComponent, SharePanelComponent, CdkMenuTrigger, CdkMenu, CdkMenuItem],
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
          <span class="state">{{
            store.server()?.status === 'PUBLISHED'
              ? t('editor.published', { visibility: t('recipes.status.' + badge()) })
              : t('recipes.status.' + badge())
          }}</span>
          <span class="save-status" role="status" [attr.data-status]="statusKey()">{{
            statusKey() === 'idle' ? '' : t('editor.status.' + statusKey())
          }}</span>
          <span class="spacer"></span>
          @if (store.server()?.status === 'DRAFT') {
            <button type="button" class="btn primary publish" [disabled]="busy() || store.uploadsUnfinished()"
              [attr.aria-describedby]="store.uploadsUnfinished() ? 'uploads-hint' : null" (click)="publish()">{{ t('editor.publish') }}</button>
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
        @if (store.saveError(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
          @if (store.restoreRefused()) {
            <button type="button" class="btn use-saved" (click)="loadLatest()">{{ t('editor.useSaved') }}</button>
          }
        }
        @if (store.uploading()) {
          <p id="uploads-hint" class="hint" role="status">{{ t('editor.waitingForUploads') }}</p>
        } @else if (store.uploadsUnfinished()) {
          <p id="uploads-hint" class="hint" role="status">{{ t('editor.uploadFailedHint') }}</p>
        }
        @if (store.restored()) {
          <p class="hint restored" role="status">{{ t('editor.restored') }}</p>
        }
        @if (store.photoGone()) {
          <p class="alert" role="alert">{{ t('editor.photoGone') }}</p>
        }
        @if (actionError(); as e) {
          <p class="alert" role="alert">{{ t(e) }}</p>
        }

        <div class="cols">
          <div class="col-left">
            <div class="cover" [class.has-photo]="!!r.coverMediaId || !!store.uploadFor('cover')" appPhotoDrop
              (dropped)="store.uploadPhoto('cover', $event)" (rejected)="store.rejectPhoto('cover', $event)">
              <app-photo-slot slot="cover" />
            </div>
            <div class="title-field">
              <label for="recipe-title">{{ t('editor.title') }}</label>
              <input id="recipe-title" type="text" [maxLength]="maxTitle" [placeholder]="t('editor.titlePlaceholder')"
                [value]="r.title" [attr.aria-invalid]="!!titleError()"
                [attr.aria-describedby]="titleError() ? 'recipe-title-error' : null"
                (input)="set('title', $any($event.target).value)" />
              @if (titleError(); as key) {
                <p id="recipe-title-error" class="field-error">{{ t(key) }}</p>
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
            <p class="visibility-hint">{{ t(r.visibility === 'PRIVATE' ? 'editor.privateHint' : 'editor.publicHint') }}</p>
            <app-share-panel class="share" />
            <section class="ingredients" [class.missing]="missing().includes('ingredients') || showInvalid() || showUnnamed()" aria-labelledby="ingredients-heading">
              <h2 id="ingredients-heading">{{ t('editor.ingredients') }}</h2>
              @if (missing().includes('ingredients')) {
                <p class="section-error field-error" role="alert">{{ t('errors.recipe_incomplete') }}</p>
              }
              @if (showInvalid()) {
                <p class="section-error field-error" role="alert">{{ t('editor.amountsInvalid') }}</p>
              }
              @if (showUnnamed()) {
                <p class="section-error field-error" role="alert">{{ t('editor.unnamedIngredientHint') }}</p>
              }
              <app-ingredients-editor />
            </section>
            <div class="notes">
              <h2><label for="recipe-notes">{{ t('editor.notes') }}</label></h2>
              <textarea id="recipe-notes" rows="4" [maxLength]="maxNotes" [value]="r.notes ?? ''"
                (input)="setNotes($any($event.target).value)"></textarea>
            </div>
          </div>
          <div class="col-right">
            <section class="steps" [class.missing]="missing().includes('steps')" aria-labelledby="steps-heading">
              <h2 id="steps-heading">{{ t('editor.steps') }}</h2>
              @if (missing().includes('steps')) {
                <p class="section-error field-error" role="alert">{{ t('errors.recipe_incomplete') }}</p>
              }
              <app-steps-editor />
            </section>
          </div>
        </div>

        <div class="bottom-bar">
          <app-photo-picker [capture]="true" icon="📷" [label]="t('editor.photo')"
            [ariaLabel]="t('editor.addStepPhoto', { n: (steps()?.targetStep() ?? 0) + 1 })" (picked)="steps()?.attachPhoto($event)"
            (rejected)="rejectBarPhoto($event)" />
          <button type="button" class="btn primary" (click)="nextStep()">{{ t('editor.nextStep') }}</button>
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
  private readonly auth = inject(AuthStore);
  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxNotes = MAX_NOTES;
  protected readonly visibilities: readonly Visibility[] = ['PRIVATE', 'PUBLIC'];
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  private readonly steps = viewChild(StepsEditorComponent);
  private readonly ingredients = viewChild(IngredientsEditorComponent);
  /** Set by a refused Publish while an amount is invalid; clears once all amounts are valid. */
  private readonly invalidAttempt = signal(false);
  protected readonly showInvalid = computed(() => this.invalidAttempt() && this.store.invalidAmounts() > 0);
  protected readonly showUnnamed = computed(() => this.invalidAttempt() && this.store.unnamedIngredients() > 0);
  /** Save status shown in the header: invalid amounts are not "Saved" (they are held back from the server). */
  protected readonly statusKey = computed(() => {
    const s = this.store.status();
    if (s !== 'idle' && s !== 'saved' && s !== 'saving') return s;
    if (this.store.invalidAmounts() > 0) return 'invalid';
    return this.store.unnamedIngredients() > 0 ? 'unnamedIngredient' : s;
  });
  /** Sections the last publish attempt reported as missing; each clears as soon as it is complete again. */
  private readonly requested = signal<readonly ('title' | 'ingredients' | 'steps')[]>([]);
  protected readonly missing = computed(() => {
    const r = this.store.recipe();
    return this.requested().filter((f) =>
      f === 'title' ? (r.title ?? '').trim() === '' : f === 'ingredients' ? countingIngredients(r.groups) === 0 : countingSteps(r.steps) === 0,
    );
  });
  /** i18n key of the title problem: the server's field code, or an empty title that publishing needs. */
  protected readonly titleError = computed(() => {
    const code = this.store.fieldErrors()['title'];
    if (code) return fieldErrorKey(code);
    const blank = (this.store.recipe().title ?? '').trim() === '';
    return blank && (this.store.server()?.status === 'PUBLISHED' || this.missing().includes('title'))
      ? 'errors.recipe_incomplete'
      : null;
  });
  protected readonly conflictCopy = computed(() => conflictText(this.store.recipe(), {
    prep: (n) => this.i18n.translate('editor.conflictPrep', { n }),
    cook: (n) => this.i18n.translate('editor.conflictCook', { n }),
    portions: (n) => this.i18n.translate('editor.conflictPortions', { n }),
  }));
  protected readonly badge = computed(() => {
    const s = this.store.server();
    if (!s || s.status === 'DRAFT') return 'draft';
    return s.visibility === 'PUBLIC' ? 'public' : 'private';
  });

  constructor() {
    // a later successful save clears an earlier action message (e.g. "Not published")
    effect(() => {
      if (this.store.status() === 'saved') untracked(() => this.actionError.set(null));
    });
    // closing the tab with a photo still uploading or failed: the browser asks first
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!this.store.uploadsUnfinished()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', beforeUnload));
    void this.store.load(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');
  }

  /**
   * For the leave guard: true at once unless a photo is uploading or failed; then a confirm dialog.
   * Signed out (session expired, logout) it never holds the redirect up: that upload cannot succeed.
   */
  async canLeave(): Promise<boolean> {
    if (!this.store.uploadsUnfinished() || this.auth.me() === null) return true;
    return confirmSheet(this.dialog, this.injector, this.i18n, {
      titleKey: 'editor.leaveConfirm.title',
      bodyKey: 'editor.leaveConfirm.body',
      cancelKey: 'editor.leaveConfirm.stay',
      confirmKey: 'editor.leaveConfirm.leave',
      cancelPrimary: true,
    });
  }

  /** The bottom bar has no step of its own: a refused file is reported on the step it was meant for. */
  protected rejectBarPhoto(key: string): void {
    const steps = this.store.recipe().steps.length;
    this.store.rejectPhoto(steps === 0 ? 'cover' : this.steps()?.targetStep() ?? steps - 1, key);
  }

  protected nextStep(): void {
    this.steps()?.addStep();
  }

  /** Publish: save first, then publish. recipe_incomplete highlights the missing sections. */
  async publish(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.requested.set([]);
    this.invalidAttempt.set(false);
    try {
      const result = await this.store.publish();
      if (result === 'invalid') {
        this.revealUnsavedInput();
      } else if (result === 'blocked') {
        this.actionError.set('editor.publishBlocked');
      }
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'recipe_incomplete') {
        const fields = (['title', 'ingredients', 'steps'] as const).filter((f) => f in (err.fields ?? {}));
        this.requested.set(fields);
        this.revealFirstMissing(fields[0]);
      } else {
        this.actionError.set(errorKey(err));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private revealUnsavedInput(): void {
    this.invalidAttempt.set(true);
    afterNextRender(() => this.ingredients()?.focusFirstProblem(), { injector: this.injector });
  }

  private revealFirstMissing(first: 'title' | 'ingredients' | 'steps' | undefined): void {
    if (!first) return;
    afterNextRender(
      () => {
        const el = document.getElementById(first === 'title' ? 'recipe-title' : `${first}-heading`);
        el?.scrollIntoView?.({ block: 'center' });
        if (first === 'title') el?.focus();
      },
      { injector: this.injector },
    );
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
    if (this.store.uploading()) {
      // a photo still going up is not saved yet: stay, so it is not lost
      this.actionError.set('editor.uploadsInProgress');
      return;
    }
    if (this.store.hasUnsavedInput()) {
      // input that cannot be saved (invalid amount, nameless ingredient with data): stay, so nothing is lost
      this.actionError.set('editor.unsavedInput');
      this.revealUnsavedInput();
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    try {
      if (!(await this.store.removeIfUntouched())) {
        await this.store.flush();
        if (this.store.autosave.dirty()) return; // stay: the status/banner says why, nothing is lost
      }
      await this.router.navigateByUrl('/recipes');
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const confirmed = await confirmSheet(this.dialog, this.injector, this.i18n, {
        titleKey: 'editor.deleteConfirm.title',
        bodyKey: 'editor.deleteConfirm.body',
        confirmKey: 'editor.deleteConfirm.confirm',
        danger: true,
      });
      if (!confirmed) return;
      await this.store.remove();
      await this.router.navigateByUrl('/recipes');
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  async loadLatest(): Promise<void> {
    this.actionError.set(null);
    try {
      await this.store.loadLatest();
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    }
  }
}
