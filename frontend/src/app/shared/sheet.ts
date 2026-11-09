import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Same query as `$bp-desktop` in styles/_tokens.scss. */
const DESKTOP_QUERY = '(min-width: 768px)';

function isDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DESKTOP_QUERY).matches
  );
}

/**
 * Opens a sheet: a centered dialog on desktop, a bottom sheet on the phone (decided at open time).
 * `injector` must see whatever the sheet injects (e.g. the page's EditorStore). Esc and a click on
 * the backdrop close it. Resolves with the value the sheet closed with, `undefined` for a dismissal;
 * callers that only fire a sheet simply don't await it.
 */
export async function openSheet<R = unknown, C = unknown, D = unknown>(
  dialog: Dialog,
  injector: Injector,
  component: ComponentType<C>,
  opts: { label: string; data?: D },
): Promise<R | undefined> {
  const desktop = isDesktop();
  const position = createGlobalPositionStrategy(injector).centerHorizontally();
  const ref = dialog.open<R, D, C>(component, {
    injector,
    data: opts.data,
    ariaLabel: opts.label,
    panelClass: ['editor-sheet', desktop ? 'editor-sheet--center' : 'editor-sheet--bottom'],
    positionStrategy: desktop ? position.centerVertically() : position.bottom('0'),
    width: desktop ? '380px' : '100%',
    maxWidth: '100vw',
    autoFocus: 'first-tabbable',
  });
  return firstValueFrom(ref.closed, { defaultValue: undefined });
}

let nextId = 0;
/** Unique ids for label/input pairs inside sheets. */
export const uid = (prefix: string) => `${prefix}-${++nextId}`;
