import { Group, StepInput } from '../recipe.model';

/** Publish completeness counts (ruling R10): ingredients with a non-blank name, steps with text or a photo. */
export const countsIngredient = (name: string | null) => (name ?? '').trim() !== '';
export const countsStep = (s: StepInput) => (s.text ?? '').trim() !== '' || s.photoMediaId !== null;

export const countingIngredients = (groups: readonly Group[]) =>
  groups.reduce((n, g) => n + g.ingredients.filter((i) => countsIngredient(i.name)).length, 0);
export const countingSteps = (steps: readonly StepInput[]) => steps.filter(countsStep).length;
