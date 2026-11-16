import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth.store';
import { initSiteAndAuth } from './app-init';
import { Site } from './site';

describe('initSiteAndAuth', () => {
  it('loads the site before the user, with both injected while the initializer starts', async () => {
    const order: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Site,
          useValue: {
            load: async () => {
              await new Promise((r) => setTimeout(r, 5));
              order.push('site');
            },
          },
        },
        {
          provide: AuthStore,
          useValue: {
            load: async () => {
              order.push('auth');
            },
          },
        },
      ],
    });

    // outside an injection context after an await, inject() throws NG0203: this fails with the old code
    await TestBed.runInInjectionContext(() => initSiteAndAuth());

    expect(order).toEqual(['site', 'auth']);
  });
});
