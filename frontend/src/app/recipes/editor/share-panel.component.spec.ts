import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { Recipe } from '../recipe.model';
import { EditorStore } from './editor-store';
import { serverRecipe } from './editor-store.testing';
import { SharePanelComponent } from './share-panel.component';

@Component({ imports: [SharePanelComponent], template: '<app-share-panel />' })
class Host {}

async function mount(initial: Recipe, resetLink = vi.fn()) {
  const server = signal<Recipe | null>(initial);
  const store = { server: server.asReadonly(), resetLink: resetLink.mockImplementation(async () => {
    server.set({ ...initial, shareUrl: 'https://x.test/r/NEW' });
    return 'reset';
  }) };
  TestBed.configureTestingModule({ providers: [provideTestTransloco(), { provide: EditorStore, useValue: store }] });
  const f = TestBed.createComponent(Host);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, resetLink };
}
const btn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;

describe('SharePanelComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

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
});
