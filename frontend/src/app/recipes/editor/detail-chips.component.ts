import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { EditorStore } from './editor-store';
import { openSheet } from '../../shared/sheet';
import { PortionsSheetComponent } from './portions-sheet.component';
import { SourceSheetComponent } from './source-sheet.component';
import { TimeKind, TimeSheetComponent, TimeSheetData, durationKey } from './time-sheet.component';

/** Serves / Prep / Cook / Source chips. Unfilled ones are dashed "+ …" placeholders; each opens its sheet. */
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
      border: 1px solid #e2dcd3;
      border-radius: 999px;
      background: #f8f5f1;
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
      background: #fff;
      color: #6f665e;
    }
    .chip.empty::before {
      content: none;
    }
    b {
      color: #c8553d;
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
      @if (r.source) {
        <button
          type="button"
          class="chip source"
          data-icon="🔗"
          aria-haspopup="dialog"
          [attr.aria-label]="t('editor.sourceSheet.label') + ': ' + r.source"
          (click)="source()"
        >
          {{ r.source }}
        </button>
      } @else {
        <button type="button" class="chip empty" aria-haspopup="dialog" (click)="source()">
          {{ t('editor.chips.addSource') }}
        </button>
      }
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

  portions(): void {
    this.open(PortionsSheetComponent, 'editor.portions.title');
  }
  time(tab: TimeKind): void {
    this.open<TimeSheetComponent, TimeSheetData>(TimeSheetComponent, 'editor.time.title', { tab });
  }
  source(): void {
    this.open(SourceSheetComponent, 'editor.sourceSheet.title');
  }

  private open<C, D = unknown>(component: ComponentType<C>, labelKey: string, data?: D): void {
    void openSheet(this.dialog, this.injector, component, {
      label: this.i18n.translate(labelKey),
      data,
    });
  }
}
