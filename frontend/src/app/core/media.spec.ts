import { mediaUrl } from './media';

describe('mediaUrl', () => {
  it('returns null for empty', () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaUrl('')).toBeNull();
  });
  it('passes through /media/ paths', () => {
    expect(mediaUrl('/media/abc.jpg')).toBe('/media/abc.jpg');
  });
  it('prefixes bare keys', () => {
    expect(mediaUrl('abc.jpg')).toBe('/media/abc.jpg');
  });
  it('rejects everything else', () => {
    expect(mediaUrl('//evil.test/x.jpg')).toBeNull();
    expect(mediaUrl('https://evil.test/x.jpg')).toBeNull();
    expect(mediaUrl('http://evil.test/x.jpg')).toBeNull();
    expect(mediaUrl('/other/x.jpg')).toBeNull();
    expect(mediaUrl('javascript:alert(1)')).toBeNull();
    expect(mediaUrl('a/../b')).toBeNull();
  });
});
