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
  m = /^(\d+|\d*[.,]\d+)$/.exec(s);
  return m ? Number(s.replace(',', '.')) : null;
}

/** Plain decimal display; fraction display comes with the reading view (Plan 4). */
export function formatAmount(n: number | null): string {
  return n === null ? '' : String(n);
}
