import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { btn, clearOverlays, overlay, pressEscape, settle } from '../testing/spec-helpers';
import { CookbookApi } from './cookbook.api';
import { Cookbook } from './cookbook.model';
import { CookbookSharePanelComponent } from './cookbook-share-panel.component';

const book = (over: Partial<Cookbook> = {}): Cookbook => ({
  id: 'c1', name: 'Desserts', description: null, visibility: 'PRIVATE', role: 'OWNER', owner: null, authors: [],
  shareUrl: 'https://x.test/c/OLD', cover: null, recipes: [], updatedAt: '', ...over,
});

@Component({
  imports: [CookbookSharePanelComponent],
  template: '<app-cookbook-share-panel [book]="book()" (updated)="book.set($event)" />',
})
class Host { book = signal(book()); }

async function mount(initial: Cookbook, resetLink = vi.fn().mockResolvedValue(book({ shareUrl: 'https://x.test/c/NEW' }))) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco(), { provide: CookbookApi, useValue: { resetLink } }] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.book.set(initial);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, resetLink };
}

describe('CookbookSharePanelComponent', () => {
  afterEach(clearOverlays);

  it('shows the link to an author and hides Reset', async () => {
    const { el } = await mount(book({ role: 'AUTHOR' }));
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/c/OLD');
    expect(btn(el, en.cookbooks.resetLink)).toBeUndefined();
  });

  it('Reset asks first, then shows the new link', async () => {
    const { f, el, resetLink } = await mount(book());
    btn(el, en.cookbooks.resetLink)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.cookbooks.resetLinkConfirm.title);
    btn(overlay(), en.common.cancel)!.click();
    await settle(f);
    expect(resetLink).not.toHaveBeenCalled();

    btn(el, en.cookbooks.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.cookbooks.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(resetLink).toHaveBeenCalledWith('c1');
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/c/NEW');
    expect(el.querySelector('[role="status"]')?.textContent).toContain(en.cookbooks.linkReset);
  });

  it('Escape closes the reset confirmation without resetting', async () => {
    const { f, el, resetLink } = await mount(book());
    btn(el, en.cookbooks.resetLink)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.cookbooks.resetLinkConfirm.title);
    pressEscape(overlay().querySelector('app-confirm-dialog')!);
    await settle(f);
    expect(overlay().querySelector('app-confirm-dialog')).toBeNull();
    expect(resetLink).not.toHaveBeenCalled();
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/c/OLD');
  });

  it('shows an error when the reset fails and keeps the old link', async () => {
    const { f, el } = await mount(book(), vi.fn().mockRejectedValue(new Error('x')));
    btn(el, en.cookbooks.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.cookbooks.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/c/OLD');
  });
});
