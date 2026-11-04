import { BaseRouteReuseStrategy } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';

/**
 * Like the default strategy, but a change of route params (e.g. `/r/a` to `/r/b`) creates a fresh
 * component instead of reusing the old one, so pages that read their params once never show stale data.
 */
export class ParamReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig && sameParams(future.params, curr.params);
  }
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
