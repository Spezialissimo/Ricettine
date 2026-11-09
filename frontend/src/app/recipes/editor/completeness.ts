import { Group, StepInput } from '../recipe.model';

/** Publish completeness counts (ruling R10): ingredients with a non-blank name, steps with text or a photo. */
export const countsIngredient = (name: string | null) => (name ?? '').trim() !== '';
export const countsStep = (s: StepInput) => (s.text ?? '').trim() !== '' || s.photoMediaId !== null;

export const countingIngredients = (groups: readonly Group[]) =>
  groups.reduce((n, g) => n + g.ingredients.filter((i) => countsIngredient(i.name)).length, 0);
export const countingSteps = (steps: readonly StepInput[]) => steps.filter(countsStep).length;

/** Positions [group, row] of nameless ingredient rows that hold an amount, unit or note: typed data the server cannot store. */
export function unnamedRows(groups: readonly Group[]): [number, number][] {
  const out: [number, number][] = [];
  groups.forEach((g, gi) =>
    g.ingredients.forEach((i, ii) => {
      if (
        !countsIngredient(i.name) &&
        (i.amount !== null || i.unit !== null || (i.note ?? '').trim() !== '')
      )
        out.push([gi, ii]);
    }),
  );
  return out;
}
