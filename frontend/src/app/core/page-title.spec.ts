import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestTransloco } from '../testing/transloco';
import { AppTitleStrategy, PageTitle } from './page-title';

@Component({ template: 'x' })
class Page {}

describe('AppTitleStrategy', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        provideRouter([
          { path: 'mine', component: Page, title: 'titles.myRecipes' },
          { path: 'plain', component: Page },
        ]),
        { provide: TitleStrategy, useExisting: AppTitleStrategy },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await new Promise((r) => setTimeout(r));
    return harness;
  }
  const title = () => TestBed.inject(Title).getTitle();

  it('titles a route from its i18n key, and falls back to the app name', async () => {
    const h = await setup();
    await h.navigateByUrl('/mine');
    await new Promise((r) => setTimeout(r));
    expect(title()).toBe('My recipes · Ricettine');
    await h.navigateByUrl('/plain');
    await new Promise((r) => setTimeout(r));
    expect(title()).toBe('Ricettine');
  });

  it('PageTitle overrides the route title until the next navigation', async () => {
    const h = await setup();
    await h.navigateByUrl('/mine');
    TestBed.inject(PageTitle).set('Tiramisù');
    expect(title()).toBe('Tiramisù · Ricettine');
    await h.navigateByUrl('/plain');
    await new Promise((r) => setTimeout(r));
    expect(title()).toBe('Ricettine');
  });

  it('PageTitle.set(null) falls back to the route title', async () => {
    const h = await setup();
    await h.navigateByUrl('/mine');
    const pt = TestBed.inject(PageTitle);
    pt.set('Tiramisù');
    pt.set(null);
    expect(title()).toBe('My recipes · Ricettine');
  });

  it('a late translation emission does not overwrite a dynamic title', async () => {
    const h = await setup();
    await h.navigateByUrl('/mine');
    TestBed.inject(PageTitle).set('Tiramisù');
    TestBed.inject(TranslocoService).setTranslation({ common: { appName: 'Ricettine' } }, 'en', { merge: true });
    await new Promise((r) => setTimeout(r));
    expect(title()).toBe('Tiramisù · Ricettine');
  });
});
