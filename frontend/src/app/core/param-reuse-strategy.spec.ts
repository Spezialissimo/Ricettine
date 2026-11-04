import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ParamReuseStrategy } from './param-reuse-strategy';

let created = 0;

@Component({ template: 'x' })
class Tok {
  constructor() {
    created++;
  }
}

describe('ParamReuseStrategy', () => {
  beforeEach(() => {
    created = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'r/:token', component: Tok },
          { path: 'recipes', component: Tok },
        ]),
        { provide: RouteReuseStrategy, useClass: ParamReuseStrategy },
      ],
    });
  });

  it('creates a fresh component when only the route param changes', async () => {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/r/a');
    await h.navigateByUrl('/r/b');
    expect(created).toBe(2);
  });

  it('reuses the component when nothing changes', async () => {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/recipes');
    await h.navigateByUrl('/recipes');
    expect(created).toBe(1);
  });
});
