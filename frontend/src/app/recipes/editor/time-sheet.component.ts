import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { uid } from '../../shared/sheet';
import { MAX_MINUTES } from '../recipe-limits';

export type TimeKind = 'prep' | 'cook';
export type TimeSheetData = { kind: TimeKind };

const TIME_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120] as const;

/** i18n key + params for a duration: 30 → "30m", 60 → "1h", 90 → "1h 30". */
export function durationKey(minutes: number): { key: string; params: { h: number; m: number } } {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const key = h === 0 ? 'editor.time.m' : m === 0 ? 'editor.time.h' : 'editor.time.hm';
  return { key, params: { h, m } };
}

const field = (kind: TimeKind) => (kind === 'prep' ? 'prepMinutes' : 'cookMinutes');

/** Prep time or cook time (one sheet each, owner Plan 7): presets and a custom h/min entry. */
@Component({
  selector: 'app-time-sheet',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../shared/sheet.scss',
  styles: `
    .presets {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 10px;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 12px 0 0;
    }
    legend {
      font-size: 0.85rem;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .custom {
      display: flex;
      gap: 6px;
      margin: 10px 0;
    }
    .custom > div {
      flex: 1;
    }
    .clear {
      margin-top: 8px;
      width: 100%;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      <h2 [id]="titleId">{{ t('editor.time.' + kind + 'Title') }}</h2>
      <div role="group" [attr.aria-labelledby]="titleId">
        <div class="presets">
          @for (p of presets; track p) {
            <button type="button" [attr.aria-pressed]="value() === p" (click)="set(p)">
              {{ t(duration(p).key, duration(p).params) }}
            </button>
          }
        </div>
        <fieldset>
          <legend>{{ t('editor.time.other') }}</legend>
          <div class="custom" (focusout)="onCustomBlur($event)">
            <div>
              <label [for]="hoursId">{{ t('editor.time.hours') }}</label>
              <input
                #h
                type="number"
                name="hours"
                inputmode="numeric"
                min="0"
                max="168"
                [id]="hoursId"
                [value]="draft()?.h ?? hours()"
                (input)="custom(h.value, m.value)"
              />
            </div>
            <div>
              <label [for]="minutesId">{{ t('editor.time.minutes') }}</label>
              <input
                #m
                type="number"
                name="minutes"
                inputmode="numeric"
                min="0"
                max="59"
                [id]="minutesId"
                [value]="draft()?.m ?? minutes()"
                (input)="custom(h.value, m.value)"
              />
            </div>
          </div>
        </fieldset>
        <button type="button" class="clear" [disabled]="value() === null" (click)="set(null)">
          {{ t('editor.time.clear') }}
        </button>
      </div>
      <button type="button" class="done" (click)="draft.set(null); ref.close()">
        {{ t('editor.sheetDone') }}
      </button>
    </ng-container>
  `,
})
export class TimeSheetComponent {
  private readonly store = inject(EditorStore);
  protected readonly ref = inject(DialogRef);
  protected readonly presets = TIME_PRESETS;
  protected readonly kind: TimeKind =
    inject<TimeSheetData | null>(DIALOG_DATA, { optional: true })?.kind ?? 'prep';
  protected readonly titleId = uid('time-title');
  protected readonly hoursId = uid('time-hours');
  protected readonly minutesId = uid('time-minutes');
  protected readonly duration = durationKey;

  protected readonly value = computed(() => this.store.recipe()[field(this.kind)]);
  protected readonly hours = computed(() =>
    this.value() === null ? '' : String(Math.floor(this.value()! / 60)),
  );
  protected readonly minutes = computed(() =>
    this.value() === null ? '' : String(this.value()! % 60),
  );

  /** Raw h/min text while the user types in the custom fields; null shows the normalized value. */
  protected readonly draft = signal<{ h: string; m: string } | null>(null);

  /** Leaving the custom fields (not just moving between them) normalizes "75 min" to 1 h 15. */
  protected onCustomBlur(e: FocusEvent): void {
    const to = e.relatedTarget as Node | null;
    if (to && (e.currentTarget as HTMLElement).contains(to)) return;
    this.draft.set(null);
  }

  set(minutes: number | null): void {
    this.draft.set(null);
    const key = field(this.kind);
    this.store.update((r) => ({ ...r, [key]: minutes }));
  }

  custom(hours: string, minutes: string): void {
    const key = field(this.kind);
    let total: number | null = null;
    if (hours.trim() || minutes.trim()) {
      const h = Math.max(0, Math.floor(Number(hours) || 0));
      const m = Math.max(0, Math.floor(Number(minutes) || 0));
      total = Math.min(MAX_MINUTES, h * 60 + m);
    }
    this.store.update((r) => ({ ...r, [key]: total }));
    this.draft.set({ h: hours, m: minutes });
  }
}
