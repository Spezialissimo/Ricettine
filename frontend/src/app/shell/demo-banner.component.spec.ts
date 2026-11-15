import { TestBed } from '@angular/core/testing';
import { provideSite } from '../testing/site';
import { en, provideTestTransloco } from '../testing/transloco';
import { DemoBannerComponent } from './demo-banner.component';

async function banner(site: Parameters<typeof provideSite>[0]) {
  TestBed.configureTestingModule({
    imports: [DemoBannerComponent],
    providers: [provideTestTransloco(), provideSite(site)],
  });
  const f = TestBed.createComponent(DemoBannerComponent);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('DemoBannerComponent', () => {
  it('renders nothing on the main site', async () => {
    expect((await banner({ demo: false })).querySelector('[role=status]')).toBeNull();
  });

  it('in the demo shows the notice, the link to the main site and the credits', async () => {
    const el = await banner({ demo: true, mainUrl: 'https://ricettine.food' });
    const status = el.querySelector('[role=status]')!;
    expect(status.textContent).toContain(en.demo.banner);
    expect(status.textContent).toContain(en.demo.credits);
    expect(status.querySelector('a')?.getAttribute('href')).toBe('https://ricettine.food');
    expect(status.querySelector('a')?.textContent?.trim()).toBe(en.demo.backToSite);
  });

  it('has no link when the main site cannot be derived', async () => {
    const el = await banner({ demo: true, mainUrl: null });
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(en.demo.credits);
  });
});
