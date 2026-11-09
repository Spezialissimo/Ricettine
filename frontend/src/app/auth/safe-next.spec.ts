import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('accepts same-origin paths', () => {
    expect(safeNext('/settings')).toBe('/settings');
    expect(safeNext('/a?b=c')).toBe('/a?b=c');
  });
  it('rejects everything else', () => {
    for (const v of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'evil',
      '',
      null,
      undefined,
    ]) {
      expect(safeNext(v)).toBe('/');
    }
  });
});
