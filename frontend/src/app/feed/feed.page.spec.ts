import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { FeedApi } from './feed.api';
import { FeedItem } from './feed.model';
import { FeedPage } from './feed.page';

const item = (id: string, over: Partial<FeedItem> = {}): FeedItem => ({
  id, title: `Recipe ${id}`, author: { username: 'ann', displayName: 'Ann', avatarUrl: null },
  shareToken: `tok-${id}`, coverThumbUrl: null, publishedAt: '2026-11-03T10:00:00Z', ...over,
});

async function mount(page: FeedApi['page']) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTestTransloco(), { provide: FeedApi, useValue: { page } }],
  });
  const f = TestBed.createComponent(FeedPage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement };
}
const more = (el: HTMLElement) => el.querySelector('button.more') as HTMLButtonElement | null;

describe('FeedPage', () => {
  it('renders cards linking to the share token, with author, date and thumb', async () => {
    const { el } = await mount(async () => ({
      items: [item('a', { coverThumbUrl: '/media/m/T.jpg?s=tok-a' }), item('b')], nextCursor: null,
    }));
    expect(el.querySelector('h1')?.textContent).toContain('Latest recipes');
    const links = Array.from(el.querySelectorAll('a.recipe')) as HTMLAnchorElement[];
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/r/tok-a', '/r/tok-b']);
    expect(links[0].textContent).toContain('Recipe a');
    const authors = Array.from(el.querySelectorAll('a.author')) as HTMLAnchorElement[];
    expect(authors[0].textContent).toContain('by Ann');
    expect(authors[0].getAttribute('href')).toBe('/u/ann');
    expect(links[0].textContent).toContain('2026');
    expect(links[0].querySelector('img')?.getAttribute('src')).toBe('/media/m/T.jpg?s=tok-a');
    expect(links[1].querySelector('img')).toBeNull();
    expect(more(el)).toBeNull();
  });

  it('loads more with the cursor and appends', async () => {
    const page = vi.fn()
      .mockResolvedValueOnce({ items: [item('a')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [item('b')], nextCursor: null });
    const { f, el } = await mount(page);
    expect(page).toHaveBeenCalledWith();
    more(el)!.click();
    await settle(f);
    expect(page).toHaveBeenLastCalledWith('c1');
    expect(el.querySelectorAll('a.recipe').length).toBe(2);
    expect(more(el)).toBeNull();
  });

  it('disables Load more while loading', async () => {
    const page = vi.fn().mockResolvedValueOnce({ items: [item('a')], nextCursor: 'c1' }).mockReturnValueOnce(new Promise(() => {}));
    const { f, el } = await mount(page);
    more(el)!.click();
    await settle(f);
    expect(more(el)!.disabled).toBe(true);
  });

  it('keeps page 1 and offers Retry when page 2 fails', async () => {
    const page = vi.fn()
      .mockResolvedValueOnce({ items: [item('a')], nextCursor: 'c1' })
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }))
      .mockResolvedValueOnce({ items: [item('b')], nextCursor: null });
    const { f, el } = await mount(page);
    more(el)!.click();
    await settle(f);
    expect(el.querySelectorAll('a.recipe').length).toBe(1);
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    expect(more(el)!.textContent).toContain('Retry');
    more(el)!.click();
    await settle(f);
    expect(el.querySelectorAll('a.recipe').length).toBe(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows an empty state linking to a new recipe', async () => {
    const { el } = await mount(async () => ({ items: [], nextCursor: null }));
    expect(el.querySelector('.empty')?.textContent).toContain('Nothing here yet');
    expect(el.querySelector('a.primary')?.getAttribute('href')).toBe('/recipes/new');
  });

  it('shows a load error with Retry', async () => {
    const page = vi.fn().mockRejectedValueOnce(new HttpErrorResponse({ status: 500 })).mockResolvedValueOnce({ items: [item('a')], nextCursor: null });
    const { f, el } = await mount(page);
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    (el.querySelector('button.retry') as HTMLButtonElement).click();
    await settle(f);
    expect(el.querySelectorAll('a.recipe').length).toBe(1);
  });
});
