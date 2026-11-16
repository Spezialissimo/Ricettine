import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { btn, clearOverlays, overlay, settle } from '../../testing/spec-helpers';
import { CookbookApi } from '../../cookbooks/cookbook.api';
import { Recipe } from '../recipe.model';
import { EditorStore } from './editor-store';
import { serverRecipe } from './editor-store.testing';
import { SharePanelComponent } from './share-panel.component';
import { provideSite } from '../../testing/site';

@Component({ imports: [SharePanelComponent], template: '<app-share-panel />' })
class Host {}

async function mount(initial: Recipe) {
  const server = signal<Recipe | null>(initial);
  TestBed.configureTestingModule({
    providers: [
      provideTestTransloco(),
      { provide: EditorStore, useValue: { server: server.asReadonly() } },
      { provide: CookbookApi, useValue: { mine: async () => [], addRecipe: vi.fn() } },
    ],
  });
  const f = TestBed.createComponent(Host);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, server };
}

describe('SharePanelComponent', () => {
  afterEach(clearOverlays);

  it('on a draft shows nothing', async () => {
    const { el } = await mount(serverRecipe());
    expect(el.querySelector('app-share-panel')?.textContent?.trim()).toBe('');
    expect(btn(el, en.cookbooks.addToCookbook)).toBeUndefined();
  });

  it('on a published recipe offers only Add to cookbook: the link and Reset link live on the recipe page', async () => {
    const { el } = await mount(
      serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }),
    );
    expect(btn(el, en.cookbooks.addToCookbook)).toBeDefined();
    expect(el.querySelector('[data-url]')).toBeNull();
    expect(btn(el, en.editor.resetLink)).toBeUndefined();
    expect(el.textContent).not.toContain(en.editor.shareTitle);
  });

  it('appears once the draft is published', async () => {
    const { f, el, server } = await mount(serverRecipe());
    expect(btn(el, en.cookbooks.addToCookbook)).toBeUndefined();
    server.set(serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/NEW' }));
    await settle(f);
    expect(btn(el, en.cookbooks.addToCookbook)).toBeDefined();
  });

  it('Add to cookbook opens the picker for that recipe', async () => {
    const { f, el } = await mount(
      serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }),
    );
    btn(el, en.cookbooks.addToCookbook)!.click();
    await settle(f);
    expect(overlay().textContent).toContain(en.cookbooks.addToCookbook);
    expect(overlay().textContent).toContain(en.cookbooks.noneYet);
  });
});

describe('SharePanelComponent in the demo', () => {
  it('has no Add to cookbook on a published recipe', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideSite({ demo: true }),
        {
          provide: EditorStore,
          useValue: {
            server: signal<Recipe | null>(
              serverRecipe({ status: 'PUBLISHED', shareUrl: 'https://x.test/r/OLD' }),
            ).asReadonly(),
          },
        },
      ],
    });
    const f = TestBed.createComponent(Host);
    await settle(f);
    expect(btn(f.nativeElement as HTMLElement, en.cookbooks.addToCookbook)).toBeUndefined();
  });
});
