export const UNITS = [
  'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'pinch', 'clove', 'slice', 'can', 'bunch',
] as const;
export type Unit = (typeof UNITS)[number];

export type RecipeStatus = 'DRAFT' | 'PUBLISHED';
export type Visibility = 'PRIVATE' | 'PUBLIC';

export type Photo = { mediaId: string; thumbUrl: string; displayUrl: string };

export type Ingredient = { amount: number | null; unit: Unit | null; name: string; note: string | null };
export type Group = { name: string | null; ingredients: Ingredient[] };
export type Step = { text: string; photo: Photo | null };

export type Recipe = {
  id: string;
  status: RecipeStatus;
  visibility: Visibility;
  title: string;
  portions: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string | null;
  notes: string | null;
  cover: Photo | null;
  groups: Group[];
  steps: Step[];
  version: number;
  shareUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type StepInput = { text: string; photoMediaId: string | null };

export type RecipeInput = {
  version: number;
  title: string;
  portions: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string | null;
  notes: string | null;
  visibility: Visibility;
  coverMediaId: string | null;
  groups: Group[];
  steps: StepInput[];
};

export type RecipeSummary = {
  id: string;
  title: string;
  status: RecipeStatus;
  visibility: Visibility;
  coverThumbUrl: string | null;
  updatedAt: string;
};

/** Builds the PUT body from a loaded recipe (photo ids are not editable until photos land). */
export function toInput(r: Recipe): RecipeInput {
  return {
    version: r.version,
    title: r.title,
    portions: r.portions,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    source: r.source,
    notes: r.notes,
    visibility: r.visibility,
    coverMediaId: r.cover?.mediaId ?? null,
    groups: r.groups.map((g) => ({ name: g.name, ingredients: g.ingredients.map((i) => ({ ...i })) })),
    steps: r.steps.map((s) => ({ text: s.text, photoMediaId: s.photo?.mediaId ?? null })),
  };
}
