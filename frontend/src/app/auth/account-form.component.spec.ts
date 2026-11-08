import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { AccountFormComponent } from './account-form.component';

describe('AccountFormComponent', () => {
  function create() {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    const f = TestBed.createComponent(AccountFormComponent);
    f.componentRef.setInput('submitLabelKey', 'auth.login');
    return f;
  }
  const type = (el: HTMLElement, sel: string, v: string) => {
    const i = el.querySelector(sel) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
    i.dispatchEvent(new Event('blur'));
  };

  it('rejects an uppercase username client-side', async () => {
    const f = create();
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    type(el, 'input[name=username]', 'Davide');
    await settle(f);
    expect(el.querySelector('[data-error=username]')?.textContent).toContain(
      en.errors.invalid_username,
    );
  });

  it('does not emit an invalid form', async () => {
    const f = create();
    const spy = vi.fn();
    f.componentInstance.submitted.subscribe(spy);
    await settle(f);
    (f.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a server username_taken error under the username field', async () => {
    const f = create();
    f.componentRef.setInput('error', { status: 409, code: 'username_taken' });
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-error=username]')?.textContent).toContain(
      en.errors.username_taken,
    );
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  it('shows other server errors in a form-level alert', async () => {
    const f = create();
    f.componentRef.setInput('error', { status: 500, code: 'internal_error' });
    await settle(f);
    expect((f.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toContain(
      en.errors.internal_error,
    );
  });

  it('emits valid values', async () => {
    const f = create();
    const spy = vi.fn();
    f.componentInstance.submitted.subscribe(spy);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    type(el, 'input[name=email]', 'a@b.co');
    type(el, 'input[name=username]', 'davide_1');
    type(el, 'input[name=displayName]', 'Davide');
    type(el, 'input[name=password]', 'longenough1');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(spy).toHaveBeenCalledWith({
      email: 'a@b.co',
      username: 'davide_1',
      displayName: 'Davide',
      password: 'longenough1',
    });
  });

  it('rejects a reserved username without emitting', async () => {
    const f = create();
    const spy = vi.fn();
    f.componentInstance.submitted.subscribe(spy);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    type(el, 'input[name=email]', 'a@b.co');
    type(el, 'input[name=username]', 'api');
    type(el, 'input[name=displayName]', 'D');
    type(el, 'input[name=password]', 'longenough1');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await f.whenStable();
    expect(spy).not.toHaveBeenCalled();
    expect(el.querySelector('[data-error=username]')?.textContent).toContain(
      en.errors.username_reserved,
    );
  });

  it('accepts an 80-char display name and rejects whitespace-only', async () => {
    const f = create();
    const spy = vi.fn();
    f.componentInstance.submitted.subscribe(spy);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    type(el, 'input[name=email]', 'a@b.co');
    type(el, 'input[name=username]', 'davide');
    type(el, 'input[name=password]', 'longenough1');
    type(el, 'input[name=displayName]', '   ');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await f.whenStable();
    expect(spy).not.toHaveBeenCalled();
    expect(el.querySelector('[data-error=displayName]')).toBeTruthy();
    type(el, 'input[name=displayName]', ` ${'x'.repeat(80)} `);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].displayName).toBe('x'.repeat(80));
    type(el, 'input[name=displayName]', 'x'.repeat(81));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(spy).toHaveBeenCalledOnce();
  });
});
