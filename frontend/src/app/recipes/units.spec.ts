import { en, itJson } from '../testing/transloco';
import { unitKey } from './units';

/** Resolves a units.* key against a translation file. */
const label = (file: typeof en, key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], file) as string;

describe('unitKey', () => {
  it.each([
    ['clove', 1, 'en', '1 clove'],
    ['clove', 2, 'en', '2 cloves'],
    ['cup', 0.5, 'en', '0.5 cup'],
    ['cup', 1.5, 'en', '1.5 cups'],
    ['clove', 1, 'it', '1 spicchio'],
    ['clove', 2, 'it', '2 spicchi'],
    ['cup', 0.5, 'it', '0.5 tazza'],
    ['tbsp', 3, 'it', '3 cucchiai'],
    ['g', 500, 'it', '500 g'],
  ] as const)('%s × %d in %s reads "%s"', (unit, n, lang, expected) => {
    const file = lang === 'it' ? itJson : en;
    expect(`${n} ${label(file, unitKey(unit, n, lang))}`).toBe(expected);
  });

  it('uses the one form without an amount', () => {
    expect(unitKey('pinch', null, 'it')).toBe('units.one.pinch');
  });
});
