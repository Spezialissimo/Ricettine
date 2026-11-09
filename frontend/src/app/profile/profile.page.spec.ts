import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PageTitle } from '../core/page-title';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { ProfileApi } from './profile.api';
import { Profile, ProfileCookbook, ProfileRecipe } from './profile.model';
import { UserProfilePage } from './profile.page';

const recipe = (id: string, over: Partial<ProfileRecipe> = {}): ProfileRecipe => ({
  id,
  title: `Recipe ${id}`,
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  shareToken: `tok-${id}`,
  coverThumbUrl: null,
  publishedAt: '2026-11-03T10:00:00Z',
  updatedAt: '2026-11-03T10:00:00Z',
  ...over,
});
const book = (id: string, over: Partial<ProfileCookbook> = {}): ProfileCookbook => ({
  id,
  name: `Book ${id}`,
  visibility: 'PUBLIC',
  recipeCount: 2,
  shareToken: `ct-${id}`,
  coverThumbUrl: null,
  ...over,
});
const profile = (over: Partial<Profile> = {}): Profile => ({
  person: { username: 'ann', displayName: 'Ann', avatarUrl: null },
  self: false,
  recipes: [],
  cookbooks: [],
  ...over,
});

const setTitle = vi.fn();

async function mount(get: ProfileApi['get']) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      { provide: ProfileApi, useValue: { get } },
      { provide: PageTitle, useValue: { set: setTitle } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ username: 'ann' }) } },
      },
    ],
  });
  const f = TestBed.createComponent(UserProfilePage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement };
}
const hrefs = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('a.recipe')).map((a) => a.getAttribute('href'));

describe('UserProfilePage', () => {
  it('visitor view: share-token links, no badges, name and handle, dynamic title', async () => {
    const get = vi
      .fn()
      .mockResolvedValue(profile({ recipes: [recipe('a'), recipe('b')], cookbooks: [book('x')] }));
    const { el } = await mount(get);
    expect(get).toHaveBeenCalledWith('ann');
    expect(el.querySelector('h1')?.textContent).toContain('Ann');
    expect(el.querySelector('.handle')?.textContent).toContain('@ann');
    expect(hrefs(el)).toEqual(['/r/tok-a', '/r/tok-b', '/c/ct-x']);
    expect(el.querySelector('.badge')).toBeNull();
    expect(setTitle).toHaveBeenCalledWith('Ann');
  });

  it('self view: badges, drafts link to the editor, cookbooks link by id', async () => {
    const { el } = await mount(async () =>
      profile({
        self: true,
        recipes: [
          recipe('d', { status: 'DRAFT', shareToken: null, title: null, publishedAt: null }),
          recipe('p', { visibility: 'PRIVATE' }),
          recipe('u'),
        ],
        cookbooks: [book('x', { visibility: 'PRIVATE' })],
      }),
    );
    expect(hrefs(el)).toEqual(['/recipes/d/edit', '/r/tok-p', '/r/tok-u', '/cookbooks/x']);
    expect(Array.from(el.querySelectorAll('.badge')).map((b) => b.textContent?.trim())).toEqual([
      'Draft',
      'Private',
      'Public',
      'Private',
    ]);
    expect(el.textContent).toContain('Untitled recipe');
  });

  it('hides the cookbooks section when empty', async () => {
    const { el } = await mount(async () => profile({ recipes: [recipe('a')] }));
    expect(el.querySelector('#prof-books')).toBeNull();
    expect(el.querySelector('#prof-recipes')).not.toBeNull();
  });

  it('empty states: visitor and self', async () => {
    let r = await mount(async () => profile());
    expect(r.el.querySelector('.empty')?.textContent).toContain('No public recipes yet.');
    TestBed.resetTestingModule();
    r = await mount(async () => profile({ self: true }));
    expect(r.el.querySelector('.empty')?.textContent).toContain('You have no recipes yet.');
  });

  it('shows not-found on 404', async () => {
    const { el } = await mount(async () => {
      throw new HttpErrorResponse({ status: 404, error: { code: 'user_not_found' } });
    });
    expect(el.querySelector('h1')?.textContent).toContain('This person is not here');
    expect(el.querySelector('.profile')).toBeNull();
  });

  it('shows a load error with Retry', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }))
      .mockResolvedValueOnce(profile({ recipes: [recipe('a')] }));
    const { f, el } = await mount(get);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(en.errors.unknown);
    (el.querySelector('button.retry') as HTMLButtonElement).click();
    await settle(f);
    expect(hrefs(el)).toEqual(['/r/tok-a']);
  });
});
