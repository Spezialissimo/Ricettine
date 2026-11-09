import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { en, provideTestTransloco } from '../testing/transloco';
import { btn, clearOverlays, overlay, person, settle } from '../testing/spec-helpers';
import { CookbookApi } from './cookbook.api';
import { Cookbook } from './cookbook.model';
import { MembersPanelComponent } from './members-panel.component';

const book = (over: Partial<Cookbook> = {}): Cookbook => ({
  id: 'c1', name: 'Weeknight', description: null, visibility: 'PRIVATE', role: 'OWNER', owner: person('ann', 'u1'),
  authors: [person('bob', 'u2')], shareUrl: 'https://x.test/c/T', cover: null, recipes: [], updatedAt: '', ...over,
});

@Component({
  imports: [MembersPanelComponent],
  template: '<app-members-panel [book]="book()" (changed)="changes = changes + 1" />',
})
class Host { book = signal(book()); changes = 0; }

async function mount(initial: Cookbook, meId: string, api: Partial<CookbookApi>) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTransloco(), { provide: CookbookApi, useValue: api }] });
  TestBed.inject(AuthStore).setMe({ id: meId, email: 'a@b.c', username: 'x', displayName: 'X', avatarUrl: null, admin: false });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(Host);
  f.componentInstance.book.set(initial);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}

describe('MembersPanelComponent', () => {
  afterEach(clearOverlays);

  it('owner sees members, Invite co-author, outstanding invites with Revoke and Remove per author, no Leave', async () => {
    const invites = vi.fn().mockResolvedValue([{ id: 'i1', createdAt: '2026-11-04T10:00:00Z', expiresAt: '2026-11-11T10:00:00Z' }]);
    const { el } = await mount(book(), 'u1', { invites });
    expect(invites).toHaveBeenCalledWith('c1');
    expect(el.textContent).toContain('ANN');
    expect(el.textContent).toContain('BOB');
    expect(btn(el, en.cookbooks.invite)).toBeTruthy();
    expect(btn(el, 'Remove BOB')).toBeTruthy();
    expect(btn(el, en.cookbooks.revokeInvite)).toBeTruthy();
    expect(btn(el, en.cookbooks.leave)).toBeUndefined();
  });

  it('an author sees only Leave: no invites call, no Invite, no Remove', async () => {
    const invites = vi.fn();
    const { el } = await mount(book({ role: 'AUTHOR' }), 'u2', { invites });
    expect(invites).not.toHaveBeenCalled();
    expect(btn(el, en.cookbooks.leave)).toBeTruthy();
    expect(btn(el, en.cookbooks.invite)).toBeUndefined();
    expect(btn(el, 'Remove BOB')).toBeUndefined();
  });

  it('Invite co-author shows the new url with its expiry and lists it', async () => {
    const createInvite = vi.fn().mockResolvedValue({ id: 'i9', url: 'https://x.test/cookbook-invite/TOK', expiresAt: '2026-11-11T10:00:00Z' });
    const { f, el } = await mount(book(), 'u1', { invites: vi.fn().mockResolvedValue([]), createInvite });
    btn(el, en.cookbooks.invite)!.click();
    await settle(f);
    expect(createInvite).toHaveBeenCalledWith('c1');
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/cookbook-invite/TOK');
    expect(el.querySelectorAll('li.invite')).toHaveLength(1);
  });

  it('Revoke removes the invite', async () => {
    const revokeInvite = vi.fn().mockResolvedValue(undefined);
    const { f, el } = await mount(book(), 'u1', {
      invites: vi.fn().mockResolvedValue([{ id: 'i1', createdAt: '', expiresAt: '2026-11-11T10:00:00Z' }]), revokeInvite,
    });
    btn(el, en.cookbooks.revokeInvite)!.click();
    await settle(f);
    expect(revokeInvite).toHaveBeenCalledWith('c1', 'i1');
    expect(el.querySelectorAll('li.invite')).toHaveLength(0);
  });

  it('Remove asks first (checkbox unchecked), passes the checkbox and tells the page', async () => {
    const removeAuthor = vi.fn().mockResolvedValue(undefined);
    const { f, el } = await mount(book(), 'u1', { invites: vi.fn().mockResolvedValue([]), removeAuthor });
    btn(el, 'Remove BOB')!.click();
    await settle(f);
    const cb = overlay().querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(overlay().textContent).toContain('BOB');
    cb.click();
    btn(overlay(), en.cookbooks.removeMember)!.click();
    await settle(f);
    expect(removeAuthor).toHaveBeenCalledWith('c1', 'u2', true);
    expect(f.componentInstance.changes).toBe(1);
  });

  it('Remove cancelled does nothing', async () => {
    const removeAuthor = vi.fn();
    const { f, el } = await mount(book(), 'u1', { invites: vi.fn().mockResolvedValue([]), removeAuthor });
    btn(el, 'Remove BOB')!.click();
    await settle(f);
    btn(overlay(), en.common.cancel)!.click();
    await settle(f);
    expect(removeAuthor).not.toHaveBeenCalled();
  });

  it('Leave removes self (unchecked by default) and goes to the list', async () => {
    const removeAuthor = vi.fn().mockResolvedValue(undefined);
    const { f, el, nav } = await mount(book({ role: 'AUTHOR' }), 'u2', { removeAuthor });
    btn(el, en.cookbooks.leave)!.click();
    await settle(f);
    expect(overlay().textContent).toContain('Weeknight');
    btn(overlay(), en.cookbooks.leaveConfirmButton)!.click();
    await settle(f);
    expect(removeAuthor).toHaveBeenCalledWith('c1', 'u2', false);
    expect(nav).toHaveBeenCalledWith('/cookbooks');
  });
});
