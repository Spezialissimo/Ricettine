import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, clearOverlays, overlay, settle } from '../../testing/spec-helpers';
import { CookbookApi } from '../../cookbooks/cookbook.api';
import { Recipe } from '../recipe.model';
import { EditorStore } from './editor-store';
import { serverRecipe } from './editor-store.testing';
import { SharePanelComponent } from './share-panel.component';

@Component({ imports: [SharePanelComponent], template: '<app-share-panel />' })
class Host {}

async function mount(initial: Recipe, resetLink = vi.fn(), status = signal<string>('saved')) {
  const server = signal<Recipe | null>(initial);
  const store = { server: server.asReadonly(), status: status.asReadonly(), resetLink: resetLink.mockImplementation(async () => {
    server.set({ ...initial, shareUrl: 'https://x.test/r/NEW' });
    return 'reset';
  }) };
  TestBed.configureTestingModule({ providers: [provideTestTransloco(), { provide: EditorStore, useValue: store }, { provide: CookbookApi, useValue: { mine: async () => [], addRecipe: vi.fn() } }] });
  const f = TestBed.createComponent(Host);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, resetLink };
}

describe('SharePanelComponent', () => {
  afterEach(clearOverlays);

  it('on a draft only says to publish to share', async () => {
    const { el } = await mount(serverRecipe());
    expect(el.textContent).toContain(en.editor.publishToShare);
    expect(el.querySelector('[data-url]')).toBeNull();
    expect(btn(el, en.editor.resetLink)).toBeUndefined();
  });

  it('on a published recipe shows the link; Reset asks first, then shows the new URL', async () => {
    const { f, el, resetLink } = await mount(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }));
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/OLD');
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.editor.resetLinkConfirm.title);
    expect(resetLink).not.toHaveBeenCalled();
    btn(overlay(), en.common.cancel)!.click();
    await settle(f);
    expect(resetLink).not.toHaveBeenCalled();
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/OLD');

    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(resetLink).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/NEW');
    expect(el.querySelector('.reset-done[role="status"]')?.textContent?.trim()).toBe(en.editor.linkReset);
  });

  it('announces nothing before a reset, nor after a reset that ended in a conflict', async () => {
    const { f, el, resetLink } = await mount(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }));
    const live = () => el.querySelector('.reset-done[role="status"]');
    expect(live()).toBeTruthy(); // the live region exists up front, so the later text is announced
    expect(live()!.textContent?.trim()).toBe('');
    resetLink.mockImplementation(async () => 'conflict');
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(live()!.textContent?.trim()).toBe('');
    expect(el.querySelector('[role="alert"]')).toBeNull(); // the editor's conflict banner is the message
  });

  it('disables Reset during a conflict and says to load the latest first', async () => {
    const status = signal('conflict');
    const { f, el } = await mount(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }), vi.fn(), status);
    const reset = btn(el, en.editor.resetLink) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    expect(el.textContent).toContain(en.editor.resetLinkLoadLatest);
    expect(reset.getAttribute('aria-describedby')).toBe('reset-conflict-hint');
    status.set('saved');
    await settle(f);
    expect(reset.disabled).toBe(false);
    expect(el.textContent).not.toContain(en.editor.resetLinkLoadLatest);
  });

  it('shows an error when the reset fails and keeps the old link', async () => {
    const { f, el } = await mount(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }), vi.fn());
    const store = TestBed.inject(EditorStore) as unknown as { resetLink: ReturnType<typeof vi.fn> };
    store.resetLink.mockRejectedValue(new Error('x'));
    btn(el, en.editor.resetLink)!.click();
    await settle(f);
    btn(overlay(), en.editor.resetLinkConfirm.confirm)!.click();
    await settle(f);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    expect(el.querySelector('[data-url]')?.textContent?.trim()).toBe('https://x.test/r/OLD');
  });

  it('on a draft shows the publish-first hint for cookbooks and no Add to cookbook button', async () => {
    const { el } = await mount(serverRecipe());
    expect(el.textContent).toContain(en.cookbooks.publishFirst);
    expect(btn(el, en.cookbooks.addToCookbook)).toBeUndefined();
  });

  it('on a published recipe Add to cookbook opens the picker for that recipe', async () => {
    const { f, el } = await mount(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }));
    expect(el.textContent).not.toContain(en.cookbooks.publishFirst);
    btn(el, en.cookbooks.addToCookbook)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.cookbooks.addToCookbook);
    expect(overlay().textContent).toContain(en.cookbooks.noneYet);
  });
});
