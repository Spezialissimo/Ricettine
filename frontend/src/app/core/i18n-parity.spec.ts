import { en, itJson } from '../testing/transloco';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

/** Every shipped language has exactly the keys and placeholders of en.json, so none falls back to English. */
describe('translation files', () => {
  const english = flatten(en as Tree);
  const italian = flatten(itJson as Tree);

  it('have the same keys', () => {
    expect([...italian.keys()].filter((k) => !english.has(k))).toEqual([]);
    expect([...english.keys()].filter((k) => !italian.has(k))).toEqual([]);
  });

  it('use the same placeholders per key', () => {
    const differ = [...english].filter(
      ([k, v]) => placeholders(v).join() !== placeholders(italian.get(k) ?? '').join(),
    );
    expect(differ.map(([k]) => k)).toEqual([]);
  });

  it('have no empty text', () => {
    const empty = [...english, ...italian].filter(([, v]) => v.trim() === '');
    expect(empty.map(([k]) => k)).toEqual([]);
  });
});
