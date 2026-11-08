import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { StepInput } from '../recipe.model';
import { countingSteps, countsStep } from './completeness';
import { uid } from '../../shared/sheet';
import { EditorStore } from './editor-store';
import { remapIndex } from './remap-index';
import { PhotoDropDirective } from './photo-drop.directive';
import { PhotoSlotComponent } from './photo-slot.component';

export const MAX_STEPS = 100;
export const MAX_STEP_TEXT = 5000;

/**
 * Numbered steps, each an auto-sizing textarea. "+ Add step" (desktop), the phone bottom bar
 * (`addStep()`) and Ctrl/Cmd+Enter inside a step add a step and focus it. Focusing a step reveals its actions.
 */
@Component({
  selector: 'app-steps-editor',
  imports: [TranslocoDirective, CdkDropList, CdkDrag, CdkDragHandle, PhotoDropDirective, PhotoSlotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './steps-editor.component.scss',
  template: `
    <ng-container *transloco="let t">
      @let steps = store.recipe().steps;
      <ol class="step-list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (s of steps; track $index; let i = $index) {
          <li class="step" cdkDrag cdkDragLockAxis="y" [cdkDragDisabled]="steps.length < 2" [class.active]="active() === i" (focusin)="active.set(i)" (click)="active.set(i)"
            appPhotoDrop (dropped)="active.set(i); store.uploadPhoto(i, $event)" (rejected)="store.rejectPhoto(i, $event)">
            <button type="button" class="drag-handle" cdkDragHandle [disabled]="steps.length < 2" [id]="handleId(i)"
              [attr.aria-label]="t('editor.reorderStep', { n: i + 1 })" (keydown)="onHandleKeydown(i, $event)">⠿</button>
            <span class="step-number" aria-hidden="true">{{ i + 1 }}</span>
            <div class="step-body">
              <textarea [id]="id(i)" rows="2" [maxLength]="maxText" [attr.aria-label]="t('editor.stepN', { n: i + 1 })"
                [value]="s.text" (input)="setText(i, $event)" (keydown)="onKeydown(i, $event)"></textarea>
              <app-photo-slot [slot]="i" [capture]="true" />
              @if (active() === i) {
                <div class="step-actions">
                  <button type="button" class="btn delete-step" [disabled]="!canDelete(s)"
                    [attr.aria-describedby]="published() && total() <= 1 ? hintId : null" (click)="remove(i)">
                    {{ t('editor.deleteStep') }}
                  </button>
                </div>
              }
            </div>
          </li>
        }
      </ol>
      <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
      @if (published() && total() <= 1) {
        <p class="hint" [id]="hintId">{{ t('editor.needsOne') }}</p>
      }
      <button type="button" class="btn add-step" [id]="base + '-add'" [disabled]="steps.length >= maxSteps" (click)="addStep()">
        {{ t('editor.addStep') }}
      </button>
    </ng-container>
  `,
})
export class StepsEditorComponent {
  protected readonly store = inject(EditorStore);
  private readonly injector = inject(Injector);
  protected readonly base = uid('step');
  protected readonly hintId = this.base + '-hint';
  protected readonly maxSteps = MAX_STEPS;
  protected readonly maxText = MAX_STEP_TEXT;
  protected readonly active = signal<number | null>(null);
  protected readonly published = computed(() => this.store.server()?.status === 'PUBLISHED');
  /** Steps that count for publishing (non-blank text or a photo). */
  protected readonly total = computed(() => countingSteps(this.store.recipe().steps));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly announcement = signal('');
  private readonly transloco = inject(TranslocoService);

  protected handleId = (i: number) => `${this.base}-h-${i}`;
  protected id = (i: number) => `${this.base}-${i}`;

  protected canDelete(s: StepInput): boolean {
    return !this.published() || !countsStep(s) || this.total() > 1;
  }

  /** Adds a step after `after` (default: at the end), focuses it and scrolls it into view. */
  addStep(after?: number): void {
    const len = this.store.recipe().steps.length;
    if (len >= MAX_STEPS) return;
    const at = after === undefined ? len : after + 1;
    this.store.update((r) => ({
      ...r,
      steps: [...r.steps.slice(0, at), { text: '', photoMediaId: null }, ...r.steps.slice(at)],
    }));
    this.store.stepInserted(at);
    this.active.set(at);
    afterNextRender(
      () => {
        const el = document.getElementById(this.id(at));
        el?.focus();
        el?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  /**
   * Phone "📷 Photo": attaches `file` to the step last focused or tapped, else the last step; with no
   * steps, adds one first.
   */
  async attachPhoto(file: File): Promise<void> {
    if (this.store.recipe().steps.length === 0) this.addStep();
    await this.store.uploadPhoto(this.targetStep() as number, file);
  }

  /** The step a phone photo goes to: the one last focused or tapped, else the last; null with no steps. */
  targetStep(): number | null {
    const last = this.store.recipe().steps.length - 1;
    const a = this.active();
    return last < 0 ? null : a !== null && a <= last ? a : last;
  }

  protected setText(i: number, ev: Event): void {
    const el = ev.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    this.store.update((r) => ({ ...r, steps: r.steps.map((s, si) => (si === i ? { ...s, text: el.value } : s)) }));
  }

  protected onKeydown(i: number, ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      this.addStep(i);
    }
  }

  protected drop(ev: CdkDragDrop<unknown>): void {
    this.move(ev.previousIndex, ev.currentIndex);
  }

  protected onHandleKeydown(i: number, ev: KeyboardEvent): void {
    const to = ev.key === 'ArrowUp' ? i - 1 : ev.key === 'ArrowDown' ? i + 1 : null;
    if (to === null) return;
    ev.preventDefault();
    this.move(i, to);
  }

  /** Moves a step; its uploads, the active step, textarea heights and focus (on its handle) follow it. */
  private move(from: number, to: number): void {
    const len = this.store.recipe().steps.length;
    if (from === to || to < 0 || to >= len) return;
    this.store.update((r) => {
      const steps = [...r.steps];
      moveItemInArray(steps, from, to);
      return { ...r, steps };
    });
    this.store.stepMoved(from, to);
    this.active.update((a) => (a === null ? a : remapIndex(a, from, to)));
    this.announcement.set(this.transloco.translate('editor.stepMoved', { n: from + 1, m: to + 1 }));
    afterNextRender(
      () => {
        this.host.nativeElement.querySelectorAll('textarea').forEach((t) => {
          t.style.removeProperty('height'); // field-sizing: content sizes it again
        });
        document.getElementById(this.handleId(to))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected remove(i: number): void {
    this.store.update((r) => ({ ...r, steps: r.steps.filter((_, si) => si !== i) }));
    this.store.stepRemoved(i);
    // focus the previous step, else the next one (now at the same index), else the add button
    const left = this.store.recipe().steps.length;
    const target = i > 0 ? i - 1 : left > 0 ? 0 : null;
    this.active.set(target);
    afterNextRender(
      () => (document.getElementById(target === null ? this.base + '-add' : this.id(target)) as HTMLElement | null)?.focus(),
      { injector: this.injector },
    );
  }
}
