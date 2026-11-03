import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { StepInput } from '../recipe.model';
import { countingSteps, countsStep } from './completeness';
import { uid } from './editor-sheet';
import { EditorStore } from './editor-store';

export const MAX_STEPS = 100;
export const MAX_STEP_TEXT = 5000;

/**
 * Numbered steps, each an auto-sizing textarea. "+ Add step" (desktop), the phone bottom bar
 * (`addStep()`) and Ctrl/Cmd+Enter inside a step add a step and focus it. Focusing a step reveals its actions.
 */
@Component({
  selector: 'app-steps-editor',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './steps-editor.component.scss',
  template: `
    <ng-container *transloco="let t">
      @let steps = store.recipe().steps;
      <ol class="step-list">
        @for (s of steps; track $index; let i = $index) {
          <li class="step" [class.active]="active() === i" (focusin)="active.set(i)" (click)="active.set(i)">
            <span class="step-number" aria-hidden="true">{{ i + 1 }}</span>
            <div class="step-body">
              <textarea [id]="id(i)" rows="2" [maxLength]="maxText" [attr.aria-label]="t('editor.stepN', { n: i + 1 })"
                [value]="s.text" (input)="setText(i, $event)" (keydown)="onKeydown(i, $event)"></textarea>
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

  protected remove(i: number): void {
    this.store.update((r) => ({ ...r, steps: r.steps.filter((_, si) => si !== i) }));
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
