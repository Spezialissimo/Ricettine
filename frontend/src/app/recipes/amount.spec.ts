import { displayAmount, formatAmount, parseAmount, scaleAmount } from './amount';

describe('parseAmount', () => {
  it.each([
    ['0.5', 0.5],
    ['0,5', 0.5],
    ['1,5', 1.5],
    ['1.000', 1],
    ['0,500', 0.5],
    ['1,50', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['¼', 0.25],
    ['¾', 0.75],
    ['1½', 1.5],
    ['  2 ', 2],
    ['1/3', 0.333],
    ['', null],
    ['   ', null],
  ])('parses %j as %j', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each([
    'abc',
    '0',
    '1/0',
    '-1',
    '1000001',
    '1/2/3',
    '1.',
    '0/5',
    '1,000',
    '12,345',
    '1,500.5',
    '1,000,000',
  ])('rejects %j', (text) => {
    expect(parseAmount(text)).toBe('invalid');
  });
});

describe('formatAmount', () => {
  it('formats decimals and null', () => {
    expect(formatAmount(0.5)).toBe('0.5');
    expect(formatAmount(500)).toBe('500');
    expect(formatAmount(null)).toBe('');
  });
});

describe('displayAmount', () => {
  const sc = { scaled: true, locale: 'en' };
  const raw = { scaled: false, locale: 'en' };
  it.each([
    [1 / 3, 'cup', '⅓'],
    [333.33, 'g', '335'],
    [1.5, 'tsp', '1½'],
    [0.04, 'g', '0.1'],
    [0.01, 'tsp', '⅛'],
    [2.678, 'kg', '2.68'],
    [22.4, 'piece', '22'],
    [1_000_000 * 100, 'g', '100,000,000'],
    [4 / 3, 'cup', '1⅓'],
    [3, 'cup', '3'],
    [2.96, 'tsp', '3'],
    [7.25, 'g', '7.3'],
    [42.4, 'ml', '42'],
    [1234, 'ml', '1,230'],
    [1.5, null, '1½'],
  ] as const)('scaled %j %s -> %s', (n, unit, expected) => {
    expect(displayAmount(n, unit, sc)).toBe(expected);
  });
  it.each([
    [333, 'g', '333'],
    [0.5, 'cup', '½'],
    [0.3, 'cup', '0.3'],
    [0.333, 'cup', '⅓'],
    [2, 'piece', '2'],
    [22.4, 'piece', '22.4'],
  ] as const)('unscaled %j %s -> %s', (n, unit, expected) => {
    expect(displayAmount(n, unit, raw)).toBe(expected);
  });
  it('null is empty', () => {
    expect(displayAmount(null, 'g', sc)).toBe('');
  });
  it('uses the locale for decimals', () => {
    expect(displayAmount(2.678, 'kg', { scaled: true, locale: 'it' })).toBe('2,68');
  });
});

describe('scaleAmount', () => {
  it('scales and keeps null', () => {
    expect(scaleAmount(200, 4, 6)).toBe(300);
    expect(scaleAmount(null, 4, 6)).toBeNull();
  });
});
