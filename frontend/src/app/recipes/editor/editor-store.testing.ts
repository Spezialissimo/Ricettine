import { signal } from '@angular/core';
import { Recipe, RecipeInput } from '../recipe.model';
import { EditorStore } from './editor-store';

export const emptyInput = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  version: 1, title: '', portions: 1, prepMinutes: null, cookMinutes: null, source: null, notes: null,
  visibility: 'PRIVATE', coverMediaId: null, groups: [], steps: [], ...over,
});

/** Minimal stand-in for components that only read `recipe` and call `update` (the sheets and chips). */
export function fakeEditorStore(over: Partial<RecipeInput> = {}, status: Recipe['status'] = 'DRAFT') {
  const recipe = signal(emptyInput(over));
  const server = signal(serverRecipe({ status }));
  const epoch = signal(0);
  const invalid = signal(0);
  return {
    recipe: recipe.asReadonly(),
    server: server.asReadonly(),
    epoch: epoch.asReadonly(),
    bumpEpoch: () => epoch.update((n) => n + 1),
    invalidAmounts: invalid.asReadonly(),
    setInvalidAmounts: (n: number) => invalid.set(n),
    uploads: signal([]).asReadonly(),
    uploadFor: () => undefined,
    photoOf: () => null,
    uploadPhoto: async () => {},
    rejectPhoto: () => {},
    removePhoto: () => {},
    previewLoaded: () => {},
    stepInserted: () => {},
    stepRemoved: () => {},
    update: (fn: (r: RecipeInput) => RecipeInput) => recipe.set(fn(recipe())),
  } as unknown as EditorStore & { recipe: () => RecipeInput; bumpEpoch: () => void };
}

export const serverRecipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', status: 'DRAFT', visibility: 'PRIVATE', title: '', portions: 1, prepMinutes: null, cookMinutes: null,
  source: null, notes: null, cover: null, groups: [], steps: [], version: 1, shareUrl: null,
  createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z', publishedAt: null, ...over,
});
