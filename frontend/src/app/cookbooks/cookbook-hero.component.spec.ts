import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { settle } from '../testing/spec-helpers';
import { CookbookHeroComponent } from './cookbook-hero.component';

@Component({
  imports: [CookbookHeroComponent],
  template: `
    <app-cookbook-hero
      [name]="name"
      [recipeCount]="count()"
      [people]="people"
      [visibility]="visibility"
      [coverUrl]="cover()"
    >
      <button type="button" class="projected">Share</button>
    </app-cookbook-hero>
  `,
})
class Host {
  name = 'Weeknight';
  count = signal(3);
  people = 'Ann and Bob';
  visibility: string | null = 'PRIVATE';
  cover = signal<string | null>(null);
}

async function mount(
  over: Partial<{
    count: number;
    cover: string | null;
    visibility: string | null;
    people: string;
  }> = {},
) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  const f = TestBed.createComponent(Host);
  if (over.count !== undefined) f.componentInstance.count.set(over.count);
  if (over.cover !== undefined) f.componentInstance.cover.set(over.cover);
  if (over.visibility !== undefined) f.componentInstance.visibility = over.visibility;
  if (over.people !== undefined) f.componentInstance.people = over.people;
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  return { el, facts: () => el.querySelector('.facts')!.textContent!.replace(/\s+/g, ' ').trim() };
}

describe('CookbookHeroComponent', () => {
  it('shows the name, a facts line (count, people, visibility) and the projected buttons', async () => {
    const { el, facts } = await mount();
    expect(el.querySelector('h1#book-title')?.textContent).toContain('Weeknight');
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('book-title');
    expect(facts()).toBe(`3 recipes · by Ann and Bob · ${en.cookbooks.visibility.PRIVATE}`);
    expect(el.querySelector('.actions button.projected')).not.toBeNull();
  });

  it('says "1 recipe" and leaves out people and visibility when there are none', async () => {
    const { facts } = await mount({ count: 1, people: '', visibility: null });
    expect(facts()).toBe('1 recipe');
  });

  it('without a cover is a plain card; with one, the photo is the banner (decorative)', async () => {
    let r = await mount();
    expect(r.el.querySelector('section.has-cover')).toBeNull();
    expect(r.el.querySelector('img.banner')).toBeNull();
    TestBed.resetTestingModule();
    r = await mount({ cover: '/media/c1/display.jpg' });
    expect(r.el.querySelector('section.has-cover')).not.toBeNull();
    const img = r.el.querySelector('img.banner')!;
    expect(img.getAttribute('src')).toBe('/media/c1/display.jpg');
    expect(img.getAttribute('alt')).toBe('');
  });
});
