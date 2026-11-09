import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { uid } from '../../shared/sheet';
import { MAX_PORTIONS, MIN_PORTIONS } from '../recipe-limits';

/** Portions: a −/+ stepper (1-100). Every tap applies to the store right away. */
@Component({
  selector: 'app-portions-sheet',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../shared/sheet.scss',
  styles: `
    .stepper { display: flex; align-items: center; justify-content: center; gap: 22px; margin: 10px 0 18px; }
    .stepper button { width: 54px; height: 54px; border-radius: 50%; font-size: 1.6rem; font-weight: 700; }
    output { font-size: 2.5rem; font-weight: 800; min-width: 60px; text-align: center; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('editor.portions.title') }}</h2>
      <p class="hint">{{ t('editor.portions.hint') }}</p>
      <div class="stepper" role="group" [attr.aria-labelledby]="titleId">
        <button type="button" [attr.aria-label]="t('editor.portions.decrease')" [disabled]="portions() <= min"
          (click)="step(-1)">−</button>
        <output aria-live="polite">{{ portions() }}</output>
        <button type="button" [attr.aria-label]="t('editor.portions.increase')" [disabled]="portions() >= max"
          (click)="step(1)">+</button>
      </div>
      <button type="button" class="done" (click)="ref.close()">{{ t('editor.sheetDone') }}</button>
    </ng-container>
  `,
})
export class PortionsSheetComponent {
  private readonly store = inject(EditorStore);
  protected readonly ref = inject(DialogRef);
  protected readonly titleId = uid('portions-title');
  protected readonly min = MIN_PORTIONS;
  protected readonly max = MAX_PORTIONS;
  protected readonly portions = computed(() => this.store.recipe().portions);

  step(delta: number): void {
    const next = Math.min(MAX_PORTIONS, Math.max(MIN_PORTIONS, this.portions() + delta));
    if (next !== this.portions()) this.store.update((r) => ({ ...r, portions: next }));
  }
}
