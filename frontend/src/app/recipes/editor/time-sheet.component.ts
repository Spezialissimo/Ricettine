import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { uid } from './editor-sheet';

export type TimeKind = 'prep' | 'cook';
export type TimeSheetData = { tab: TimeKind };

export const MAX_MINUTES = 10080;
export const TIME_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120] as const;

/** i18n key + params for a duration: 30 → "30m", 60 → "1h", 90 → "1h 30". */
export function durationKey(minutes: number): { key: string; params: { h: number; m: number } } {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const key = h === 0 ? 'editor.time.m' : m === 0 ? 'editor.time.h' : 'editor.time.hm';
  return { key, params: { h, m } };
}

const field = (kind: TimeKind) => (kind === 'prep' ? 'prepMinutes' : 'cookMinutes');

/** Prep and cook time in one sheet: a tab each, presets, and a custom h/min entry. */
@Component({
  selector: 'app-time-sheet',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sheet.scss',
  styles: `
    .tabs, .custom { display: flex; gap: 6px; margin: 10px 0; }
    .tabs button { flex: 1; }
    .presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    fieldset { border: 0; padding: 0; margin: 12px 0 0; }
    legend { font-size: 0.85rem; color: #6f665e; margin-bottom: 4px; }
    .custom > div { flex: 1; }
    .clear { margin-top: 8px; width: 100%; }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('editor.time.title') }}</h2>
      <div class="tabs" role="tablist" [attr.aria-labelledby]="titleId" (keydown)="onTabKey($event)">
        @for (k of kinds; track k) {
          <button type="button" role="tab" [id]="tabId + k" [attr.aria-controls]="panelId"
            [attr.aria-selected]="tab() === k" [attr.tabindex]="tab() === k ? 0 : -1" (click)="tab.set(k)">
            {{ t('editor.time.' + k) }}
          </button>
        }
      </div>
      <div role="tabpanel" [id]="panelId" [attr.aria-labelledby]="tabId + tab()">
        <div class="presets">
          @for (p of presets; track p) {
            <button type="button" [attr.aria-pressed]="value() === p" (click)="set(p)">
              {{ t(duration(p).key, duration(p).params) }}
            </button>
          }
        </div>
        <fieldset>
          <legend>{{ t('editor.time.other') }}</legend>
          <div class="custom">
            <div>
              <label [for]="hoursId">{{ t('editor.time.hours') }}</label>
              <input #h type="number" name="hours" inputmode="numeric" min="0" max="168" [id]="hoursId"
                [value]="hours()" (input)="custom(h.value, m.value)" />
            </div>
            <div>
              <label [for]="minutesId">{{ t('editor.time.minutes') }}</label>
              <input #m type="number" name="minutes" inputmode="numeric" min="0" max="59" [id]="minutesId"
                [value]="minutes()" (input)="custom(h.value, m.value)" />
            </div>
          </div>
        </fieldset>
        <button type="button" class="clear" [disabled]="value() === null" (click)="set(null)">
          {{ t('editor.time.clear') }}
        </button>
      </div>
      <button type="button" class="done" (click)="ref.close()">{{ t('editor.sheetDone') }}</button>
    </ng-container>
  `,
})
export class TimeSheetComponent {
  private readonly store = inject(EditorStore);
  protected readonly ref = inject(DialogRef);
  protected readonly kinds: readonly TimeKind[] = ['prep', 'cook'];
  protected readonly presets = TIME_PRESETS;
  protected readonly tab = signal<TimeKind>(inject<TimeSheetData | null>(DIALOG_DATA, { optional: true })?.tab ?? 'prep');
  protected readonly titleId = uid('time-title');
  protected readonly tabId = uid('time-tab-');
  protected readonly panelId = uid('time-panel');
  protected readonly hoursId = uid('time-hours');
  protected readonly minutesId = uid('time-minutes');
  protected readonly duration = durationKey;

  protected readonly value = computed(() => this.store.recipe()[field(this.tab())]);
  protected readonly hours = computed(() => (this.value() === null ? '' : String(Math.floor(this.value()! / 60))));
  protected readonly minutes = computed(() => (this.value() === null ? '' : String(this.value()! % 60)));

  set(minutes: number | null): void {
    const key = field(this.tab());
    this.store.update((r) => ({ ...r, [key]: minutes }));
  }

  custom(hours: string, minutes: string): void {
    if (!hours.trim() && !minutes.trim()) return this.set(null);
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    const m = Math.max(0, Math.floor(Number(minutes) || 0));
    this.set(Math.min(MAX_MINUTES, h * 60 + m));
  }

  protected onTabKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: TimeKind = this.tab() === 'prep' ? 'cook' : 'prep';
    this.tab.set(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[id="${this.tabId + next}"]`)?.focus();
  }
}
