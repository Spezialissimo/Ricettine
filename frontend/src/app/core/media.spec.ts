import { mediaUrl } from './media';

describe('mediaUrl', () => {
  it('returns null for empty', () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
  });
  it('passes through absolute paths', () => {
    expect(mediaUrl('/media/abc.jpg')).toBe('/media/abc.jpg');
  });
  it('prefixes bare keys', () => {
    expect(mediaUrl('abc.jpg')).toBe('/media/abc.jpg');
  });
});
