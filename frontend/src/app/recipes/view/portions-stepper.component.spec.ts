import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { PortionsStepperComponent } from './portions-stepper.component';

@Component({
  imports: [PortionsStepperComponent],
  template: `<app-portions-stepper
    [value]="value()"
    [written]="4"
    (valueChange)="value.set($event)"
  />`,
})
class Host {
  readonly value = signal(4);
}

async function mount(start: number) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.value.set(start);
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  const btn = (name: string) =>
    el.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
  return { f, el, btn, host: f.componentInstance };
}

describe('PortionsStepperComponent', () => {
  it('disables - at 1 and + at 100', async () => {
    let r = await mount(1);
    expect(r.btn('Fewer portions').disabled).toBe(true);
    expect(r.btn('More portions').disabled).toBe(false);
    TestBed.resetTestingModule();
    r = await mount(100);
    expect(r.btn('Fewer portions').disabled).toBe(false);
    expect(r.btn('More portions').disabled).toBe(true);
  });

  it('emits on click and shows the serves text in a status region', async () => {
    const r = await mount(4);
    expect(r.el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Serves 4');
    r.btn('More portions').click();
    await settle(r.f);
    expect(r.host.value()).toBe(5);
    r.btn('Fewer portions').click();
    await settle(r.f);
    r.btn('Fewer portions').click();
    await settle(r.f);
    expect(r.host.value()).toBe(3);
    expect(r.el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Serves 3');
  });

  it('offers Reset only when different from the written portions', async () => {
    const r = await mount(4);
    const reset = () =>
      Array.from(r.el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reset');
    expect(reset()).toBeUndefined();
    r.btn('More portions').click();
    await settle(r.f);
    reset()!.click();
    await settle(r.f);
    expect(r.host.value()).toBe(4);
    expect(reset()).toBeUndefined();
  });
});
