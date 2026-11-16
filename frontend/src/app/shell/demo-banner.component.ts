import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Site } from '../core/site';

/**
 * Persistent notice above every page of the demo site (nothing on the main site): changes are not saved, a link
 * back to the main site (its address is the demo host without the `demo.` label, see `mainSiteUrl`) and the
 * content credits. A polite status region, so it never takes focus.
 */
@Component({
  selector: 'app-demo-banner',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../styles/tokens' as t;

    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: t.$space-1 t.$space-4;
      padding: t.$space-2 t.$space-4;
      background: var(--pill-bg);
      color: var(--pill-ink);
      font-size: 0.9rem;
    }
    p {
      margin: 0;
    }
    .credits {
      opacity: 0.85;
      font-size: 0.85rem;
    }
    a {
      @include t.touch-target;
      display: inline-flex;
      align-items: center;
      color: inherit;
      font-weight: 600;
    }
  `,
  template: `
    @if (site.demo()) {
      <div class="banner" role="status" *transloco="let t">
        <p>{{ t('demo.banner') }}</p>
        @if (site.mainUrl; as url) {
          <a [href]="url">{{ t('demo.backToSite') }}</a>
        }
        <p class="credits">{{ t('demo.credits') }}</p>
      </div>
    }
  `,
})
export class DemoBannerComponent {
  protected readonly site = inject(Site);
}
