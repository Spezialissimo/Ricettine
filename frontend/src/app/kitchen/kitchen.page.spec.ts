import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { en, provideTestTransloco } from '../testing/transloco';
import { KitchenPage } from './kitchen.page';

@Component({ template: '<p class="tab">tab</p>' })
class Tab {}

describe('KitchenPage', () => {
  it('has the My kitchen heading and Overview, Recipes, Cookbooks tabs marking the current one', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideRouter([
          {
            path: 'kitchen',
            component: KitchenPage,
            children: [
              { path: '', component: Tab },
              { path: 'recipes', component: Tab },
              { path: 'cookbooks', component: Tab },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const el = harness.fixture.nativeElement as HTMLElement;
    const current = () =>
      Array.from(el.querySelectorAll('nav a[aria-current="page"]'), (a) => a.textContent?.trim());

    await harness.navigateByUrl('/kitchen');
    expect(el.querySelector('h1')?.textContent).toContain(en.kitchen.title);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe(en.kitchen.tabs);
    expect(Array.from(el.querySelectorAll('nav a'), (a) => a.getAttribute('href'))).toEqual([
      '/kitchen',
      '/kitchen/recipes',
      '/kitchen/cookbooks',
    ]);
    expect(current()).toEqual([en.kitchen.overview]);

    await harness.navigateByUrl('/kitchen/cookbooks');
    expect(current()).toEqual([en.kitchen.cookbooks]);
  });
});
