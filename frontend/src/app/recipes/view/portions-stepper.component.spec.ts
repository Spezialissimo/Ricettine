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
  const pill = () => el.querySelector('app-portions-stepper') as HTMLElement;
  return { f, el, btn, pill, host: f.componentInstance };
}

describe('PortionsStepperComponent', () => {
  it('disables − at 1 and + at 100', async () => {
    let r = await mount(1);
    expect(r.btn('Fewer portions').disabled).toBe(true);
    expect(r.btn('More portions').disabled).toBe(false);
    TestBed.resetTestingModule();
    r = await mount(100);
    expect(r.btn('Fewer portions').disabled).toBe(false);
    expect(r.btn('More portions').disabled).toBe(true);
  });

  it('is one pill "− N servings +": the count between the buttons, in a status region', async () => {
    const r = await mount(4);
    const parts = Array.from(r.pill().children).map(
      (c) => c.getAttribute('aria-label') ?? c.getAttribute('role'),
    );
    expect(parts).toEqual(['Fewer portions', 'status', 'More portions']);
    expect(r.el.querySelector('[role="status"]')?.textContent?.trim()).toBe('4 servings');
    r.btn('More portions').click();
    await settle(r.f);
    expect(r.host.value()).toBe(5);
    r.btn('Fewer portions').click();
    await settle(r.f);
    r.btn('Fewer portions').click();
    await settle(r.f);
    expect(r.host.value()).toBe(3);
    expect(r.el.querySelector('[role="status"]')?.textContent?.trim()).toBe('3 servings');
  });

  it('says "1 serving" for one', async () => {
    const r = await mount(1);
    expect(r.el.querySelector('[role="status"]')?.textContent?.trim()).toBe('1 serving');
  });

  it('has no Reset; it is marked scaled while it differs from the written portions', async () => {
    const r = await mount(4);
    expect(r.pill().classList.contains('scaled')).toBe(false);
    expect(
      Array.from(r.el.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Reset'),
    ).toBe(false);
    r.btn('More portions').click();
    await settle(r.f);
    expect(r.pill().classList.contains('scaled')).toBe(true);
    expect(r.el.querySelectorAll('button').length).toBe(2);
    r.btn('Fewer portions').click();
    await settle(r.f);
    expect(r.pill().classList.contains('scaled')).toBe(false);
  });
});
