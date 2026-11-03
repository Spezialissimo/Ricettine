import { formatAmount, parseAmount } from './amount';

describe('parseAmount', () => {
  it.each([
    ['0.5', 0.5],
    ['0,5', 0.5],
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

  it.each(['abc', '0', '1/0', '-1', '1000001', '1/2/3', '1.', '0/5'])('rejects %j', (text) => {
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
