import { Recipe, toInput } from './recipe.model';

const recipe = (): Recipe =>
  ({
    id: 'r1',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    title: 'Lasagne',
    portions: 4,
    prepMinutes: 30,
    cookMinutes: 45,
    source: 'Nonna',
    notes: 'Less salt',
    cover: { mediaId: 'c1', thumbUrl: '/media/c1/THUMB.jpg', displayUrl: '/media/c1/DISPLAY.jpg' },
    groups: [
      {
        name: 'Ragù',
        // extra server-side properties must never leak into the PUT body
        ingredients: [{ amount: 500, unit: 'g', name: 'beef', note: null, id: 'leak' } as never],
      },
      { name: null, ingredients: [{ amount: null, unit: null, name: 'salt', note: 'to taste' }] },
    ],
    steps: [
      { text: 'Brown', photo: { mediaId: 'p1', thumbUrl: 't', displayUrl: 'd' } },
      { text: 'Simmer', photo: null },
    ],
    version: 9,
    shareUrl: '/r/tok',
    createdAt: 'c',
    updatedAt: 'u',
    publishedAt: 'p',
  }) as Recipe;

describe('toInput', () => {
  it('maps every editable field explicitly and drops read-only ones', () => {
    expect(toInput(recipe())).toEqual({
      version: 9,
      title: 'Lasagne',
      portions: 4,
      prepMinutes: 30,
      cookMinutes: 45,
      source: 'Nonna',
      notes: 'Less salt',
      visibility: 'PUBLIC',
      coverMediaId: 'c1',
      groups: [
        { name: 'Ragù', ingredients: [{ amount: 500, unit: 'g', name: 'beef', note: null }] },
        { name: null, ingredients: [{ amount: null, unit: null, name: 'salt', note: 'to taste' }] },
      ],
      steps: [
        { text: 'Brown', photoMediaId: 'p1' },
        { text: 'Simmer', photoMediaId: null },
      ],
    });
  });

  it('does not share nested objects with the server copy', () => {
    const r = recipe();
    const i = toInput(r);
    i.groups[0].ingredients[0].name = 'changed';
    expect(r.groups[0].ingredients[0].name).toBe('beef');
  });
});
