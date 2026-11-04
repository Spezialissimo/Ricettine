import { CanDeactivateFn } from '@angular/router';
import type { RecipeEditorPage } from './recipe-editor.page';

/**
 * Leaving the editor (nav link, back, Done) with a photo upload in flight or failed asks first: the
 * photo itself cannot be kept locally. Text never needs this: the local backup keeps it.
 * Type-only import, so the lazy editor chunk stays out of the initial bundle.
 */
export const leaveEditorGuard: CanDeactivateFn<RecipeEditorPage> = (page) => page.canLeave();
