import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ScreenWakeLock } from './screen-wake-lock';

/** The "Keep screen on" checkbox (desktop); the state lives in ScreenWakeLock. Not rendered without the API. */
@Component({
  selector: 'app-keep-screen-on',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      min-width: 44px;
      cursor: pointer;
    }
    input {
      width: 24px;
      height: 24px;
      margin: 0;
    }
  `,
  template: `
    @if (wake.supported) {
      <label *transloco="let t">
        <input
          #box
          type="checkbox"
          [checked]="wake.on()"
          (change)="wake.toggle($any($event.target).checked)"
        />
        {{ t('recipes.keepScreenOn') }}
      </label>
    }
  `,
})
export class KeepScreenOnComponent {
  protected readonly wake = inject(ScreenWakeLock);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  constructor() {
    // a refused lock turns the state off while the box was toggled natively: keep the box in step
    effect(() => {
      const on = this.wake.on();
      const box = this.box();
      if (box && box.nativeElement.checked !== on) box.nativeElement.checked = on;
    });
  }
}
