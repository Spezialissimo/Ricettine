import { Unit } from './recipe.model';

const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
const MAX = 1_000_000;

/**
 * Parses an ingredient amount typed by a person: `0.5`, `0,5`, `1/2`, `1 1/2`, `½`, `1½`.
 * Empty text means "no amount" (null); anything unparseable or not in (0, 1 000 000] is 'invalid'.
 * The result is rounded to 3 decimals (the server limit).
 */
export function parseAmount(text: string): number | null | 'invalid' {
  const s = text.trim();
  if (s === '') return null;
  const value = parseValue(s);
  if (value === null || !Number.isFinite(value) || value <= 0) return 'invalid';
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 && rounded <= MAX ? rounded : 'invalid';
}

function parseValue(s: string): number | null {
  let m = /^(\d+)?\s*([½¼¾])$/.exec(s);
  if (m) return (m[1] ? Number(m[1]) : 0) + VULGAR[m[2]];
  m = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[3]);
    return den === 0 ? null : (m[1] ? Number(m[1]) : 0) + Number(m[2]) / den;
  }
  // '1,000' reads as one thousand to an English reader and as one to a decimal-comma one: ask rather than guess.
  // A leading 0 ('0,500') cannot be a thousands group, so that stays a decimal.
  if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) return null;
  m = /^(\d+|\d*[.,]\d+)$/.exec(s);
  return m ? Number(s.replace(',', '.')) : null;
}

/** Plain decimal text for the editor's input field; the reading view uses displayAmount. */
export function formatAmount(n: number | null): string {
  return n === null ? '' : String(n);
}

/** Multiplies a written amount for the chosen portions; no amount stays no amount. */
export function scaleAmount(amount: number | null, written: number, chosen: number): number | null {
  return amount === null ? null : (amount * chosen) / written;
}

const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
];

/**
 * Reading-view amount text. Metric units are rounded to kitchen-friendly steps once scaled; every other
 * unit (and no unit) shows whole + fraction (1⅓). Unscaled values are exactly what the author wrote.
 */
export function displayAmount(
  n: number | null,
  unit: Unit | null,
  opts: { scaled: boolean; locale: string },
): string {
  if (n === null) return '';
  const num = (v: number, max: number) =>
    new Intl.NumberFormat(opts.locale, { maximumFractionDigits: max }).format(v);
  if (unit === 'g' || unit === 'ml') {
    if (!opts.scaled) return num(n, 3);
    if (n < 10) return num(Math.max(Math.round(n * 10) / 10, 0.1), 1);
    if (n < 100) return num(Math.round(n), 0);
    if (n < 1000) return num(Math.round(n / 5) * 5, 0);
    return num(Math.round(n / 10) * 10, 0);
  }
  if (unit === 'kg' || unit === 'l') return num(n, opts.scaled ? 2 : 3);
  if (opts.scaled && n >= 20) return num(Math.round(n), 0);
  let whole = Math.floor(n);
  const [value, glyph] = FRACTIONS.reduce((best, f) =>
    Math.abs(f[0] - (n - whole)) < Math.abs(best[0] - (n - whole)) ? f : best,
  );
  if (!opts.scaled && Math.abs(value - (n - whole)) > 0.01) return num(n, 3);
  if (value === 1) whole += 1;
  if (whole === 0 && value === 0) return '⅛'; // a positive amount never shows as 0
  return (whole > 0 ? num(whole, 0) : '') + glyph;
}
