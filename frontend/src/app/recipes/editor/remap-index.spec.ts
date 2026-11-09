import { remapIndex } from './remap-index';

describe('remapIndex', () => {
  it.each([
    // [i, from, to, expected, why]
    [2, 2, 0, 0, 'the moved item itself lands on `to`'],
    [0, 0, 3, 3, 'the moved item itself, moving down'],
    [1, 0, 2, 0, 'moving down: an item between shifts up'],
    [2, 0, 2, 1, 'moving down: the item at `to` shifts up'],
    [3, 0, 2, 3, 'moving down: past `to` stays'],
    [1, 2, 0, 2, 'moving up: an item between shifts down'],
    [0, 2, 0, 1, 'moving up: the item at `to` shifts down'],
    [3, 2, 0, 3, 'moving up: past `from` stays'],
    [5, 1, 3, 5, 'outside the range'],
    [0, 1, 3, 0, 'before the range'],
    [4, 4, 4, 4, 'no move at all'],
  ])('%i with a move %i -> %i is %i (%s)', (i, from, to, expected) => {
    expect(remapIndex(i as number, from as number, to as number)).toBe(expected);
  });
});
