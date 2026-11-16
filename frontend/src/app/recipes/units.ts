import { pluralCategory } from '../core/language';
import { Unit } from './recipe.model';

/**
 * The i18n key for a unit next to the amount shown: `units.one.<u>` ("1 clove", "½ cup", "1 spicchio") or
 * `units.other.<u>` ("2 cloves", "1½ cups", "2 spicchi"). Up to 1 reads as one in both languages (a half cup,
 * mezza tazza); above that the language's plural rules decide. No amount → the one form.
 */
export function unitKey(unit: Unit, shown: number | null, lang: string): string {
  const one = shown === null || shown <= 1 || pluralCategory(shown, lang) === 'one';
  return `units.${one ? 'one' : 'other'}.${unit}`;
}
