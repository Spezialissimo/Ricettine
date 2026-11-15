import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { openSheet } from '../../shared/sheet';
import { PortionsSheetComponent } from './portions-sheet.component';
import { MAX_SOURCE } from '../recipe-limits';
import { uid } from '../../shared/sheet';
import { TimeKind, TimeSheetComponent, TimeSheetData, durationKey } from './time-sheet.component';

/**
 * Serves / Prep time / Cook time chips (unfilled ones are dashed "+ …" placeholders; each opens its own sheet),
 * then Source as a plain text field.
 */
@Component({
  selector: 'app-detail-chips',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .chip {
      min-height: 44px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--subtle);
      color: inherit;
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .chip::before {
      content: attr(data-icon) ' ' / '';
    }
    .chip.empty {
      border-style: dashed;
      background: var(--surface);
      color: var(--muted);
    }
    .chip.empty::before {
      content: none;
    }
    .source {
      flex-basis: 100%;
      display: grid;
      gap: 4px;
      margin-top: 6px;
    }
    .source label {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .source input {
      min-height: 44px;
      width: 100%;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg);
      color: var(--ink);
      font: inherit;
      font-size: 0.95rem;
      text-overflow: ellipsis;
    }
  `,
  template: `
    <ng-container *transloco="let t">
      @let r = store.recipe();
      <button type="button" class="chip" data-icon="🍽" aria-haspopup="dialog" (click)="portions()">
        {{ t('editor.chips.serves', { n: r.portions }) }}
      </button>
      @for (k of kinds; track k) {
        @let minutes = k === 'prep' ? r.prepMinutes : r.cookMinutes;
        @if (minutes !== null) {
          @let d = duration(minutes);
          <button
            type="button"
            class="chip"
            [attr.data-icon]="k === 'prep' ? '⏱' : '🔥'"
            aria-haspopup="dialog"
            (click)="time(k)"
          >
            {{ t('editor.chips.' + k, { time: t(d.key, d.params) }) }}
          </button>
        } @else {
          <button type="button" class="chip empty" aria-haspopup="dialog" (click)="time(k)">
            {{ t(k === 'prep' ? 'editor.chips.addPrep' : 'editor.chips.addCook') }}
          </button>
        }
      }
      <!-- Source is a plain field, not a chip: a long link wraps badly in a pill (owner, Plan 7) -->
      <div class="source">
        <label [for]="sourceId">{{ t('editor.sourceSheet.label') }}</label>
        <input
          type="text"
          [id]="sourceId"
          [maxLength]="maxSource"
          [placeholder]="t('editor.sourcePlaceholder')"
          [value]="r.source ?? ''"
          (input)="setSource($any($event.target).value)"
        />
      </div>
    </ng-container>
  `,
})
export class DetailChipsComponent {
  protected readonly store = inject(EditorStore);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly kinds: readonly TimeKind[] = ['prep', 'cook'];
  protected readonly duration = durationKey;
  protected readonly maxSource = MAX_SOURCE;
  protected readonly sourceId = uid('source');

  portions(): void {
    this.open(PortionsSheetComponent, 'editor.portions.title');
  }
  time(kind: TimeKind): void {
    this.open<TimeSheetComponent, TimeSheetData>(TimeSheetComponent, `editor.time.${kind}Title`, {
      kind,
    });
  }

  protected setSource(value: string): void {
    const source = value.trim() ? value : null;
    this.store.update((r) => ({ ...r, source }));
  }

  private open<C, D = unknown>(component: ComponentType<C>, labelKey: string, data?: D): void {
    void openSheet(this.dialog, this.injector, component, {
      label: this.i18n.translate(labelKey),
      data,
    });
  }
}
