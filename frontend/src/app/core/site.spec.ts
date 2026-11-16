import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Site, mainSiteUrl } from './site';

describe('Site', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('parses the demo flags of the setup status', async () => {
    const site = TestBed.inject(Site);
    const http = TestBed.inject(HttpTestingController);
    expect(site.demo()).toBe(false);
    expect(site.demoUrl()).toBeNull();
    const p = site.load();
    http
      .expectOne('/api/setup/status')
      .flush({ setupRequired: false, demo: true, demoUrl: 'https://demo.ricettine.food' });
    await p;
    expect(site.demo()).toBe(true);
    expect(site.demoUrl()).toBe('https://demo.ricettine.food');
    http.verify();
  });

  it('stays a main site when the status is unreachable', async () => {
    const site = TestBed.inject(Site);
    const http = TestBed.inject(HttpTestingController);
    const p = site.load();
    http.expectOne('/api/setup/status').error(new ProgressEvent('error'));
    await p;
    expect(site.demo()).toBe(false);
  });

  it('derives the main site from the demo host by dropping the demo label', () => {
    expect(mainSiteUrl({ protocol: 'https:', hostname: 'demo.ricettine.food', port: '' })).toBe(
      'https://ricettine.food',
    );
    expect(mainSiteUrl({ protocol: 'http:', hostname: 'demo.localhost', port: '8080' })).toBe(
      'http://localhost:8080',
    );
    expect(mainSiteUrl({ protocol: 'https:', hostname: 'ricettine.food', port: '' })).toBeNull();
  });
});
