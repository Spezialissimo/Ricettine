import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKey, fieldErrorKey, toApiError } from '../core/api-error';
import { uid } from '../shared/sheet';
import { CookbookInput, CookbookVisibility, MAX_DESCRIPTION, MAX_NAME, codePoints } from './cookbook.model';

export type CookbookFormData = {
  /** Present when editing. */
  initial?: { name: string; description: string | null; visibility: CookbookVisibility };
  /** Performs the create/patch; a rejection is shown in the form, success closes it with `true`. */
  submit: (input: CookbookInput) => Promise<unknown>;
};

/** Name, description and visibility of a cookbook: validates like the server (code points), then calls `submit`. */
@Component({
  selector: 'app-cookbook-form-dialog',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/sheet.scss',
  styles: `
    .field { margin-bottom: 12px; }
    textarea { width: 100%; min-height: 88px; padding: 8px 12px; font: inherit; border: 1px solid #e2dcd3; border-radius: 10px; box-sizing: border-box; }
    fieldset { border: 0; margin: 0 0 12px; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; }
    legend { font-size: 0.85rem; color: #6f665e; margin-bottom: 4px; padding: 0; }
    fieldset label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin: 0; color: inherit; font-size: 1rem; }
    fieldset input { width: auto; min-height: 0; }
    .field-error, .alert { color: #b3261e; margin: 4px 0 0; font-size: 0.85rem; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .actions button { padding: 0 16px; }
    .actions .primary { background: #c8553d; border-color: #c8553d; color: #fff; font-weight: 700; }
  `,
  template: `
    <form *transloco="let t" (submit)="$event.preventDefault(); save()" novalidate>
      <h2 [id]="titleId">{{ t(data.initial ? 'cookbooks.editTitle' : 'cookbooks.newTitle') }}</h2>
      <div class="field">
        <label [for]="nameId">{{ t('cookbooks.name') }}</label>
        <input [id]="nameId" type="text" [value]="name()" (input)="name.set($any($event.target).value)"
          [attr.aria-invalid]="!!errors()['name']" [attr.aria-describedby]="errors()['name'] ? nameId + '-err' : null" />
        @if (errors()['name']; as code) { <p class="field-error" [id]="nameId + '-err'">{{ t(fieldErrorKey(code)) }}</p> }
      </div>
      <div class="field">
        <label [for]="descId">{{ t('cookbooks.description') }}</label>
        <textarea [id]="descId" [value]="description()" (input)="description.set($any($event.target).value)"
          [attr.aria-invalid]="!!errors()['description']" [attr.aria-describedby]="errors()['description'] ? descId + '-err' : null"></textarea>
        @if (errors()['description']; as code) { <p class="field-error" [id]="descId + '-err'">{{ t(fieldErrorKey(code)) }}</p> }
      </div>
      <fieldset>
        <legend>{{ t('cookbooks.visibilityLabel') }}</legend>
        @for (v of visibilities; track v) {
          <label>
            <input type="radio" name="cookbook-visibility" [value]="v" [checked]="visibility() === v" (change)="visibility.set(v)" />
            {{ t('cookbooks.visibility.' + v) }}
          </label>
        }
      </fieldset>
      @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
      <div class="actions">
        <button type="button" (click)="ref.close(false)">{{ t('common.cancel') }}</button>
        <button type="submit" class="primary" [disabled]="busy()">{{ t(data.initial ? 'common.save' : 'cookbooks.create') }}</button>
      </div>
    </form>
  `,
})
export class CookbookFormDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<CookbookFormData>(DIALOG_DATA);
  protected readonly titleId = uid('cookbook-form-title');
  protected readonly nameId = uid('cookbook-name');
  protected readonly descId = uid('cookbook-desc');
  protected readonly visibilities: readonly CookbookVisibility[] = ['PRIVATE', 'PUBLIC'];
  protected readonly fieldErrorKey = fieldErrorKey;
  protected readonly name = signal(this.data.initial?.name ?? '');
  protected readonly description = signal(this.data.initial?.description ?? '');
  protected readonly visibility = signal<CookbookVisibility>(this.data.initial?.visibility ?? 'PRIVATE');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const name = this.name().trim();
    const description = this.description().trim();
    const errors: Record<string, string> = {};
    if (name === '') errors['name'] = 'required';
    else if (codePoints(name) > MAX_NAME) errors['name'] = 'too_long';
    if (codePoints(description) > MAX_DESCRIPTION) errors['description'] = 'too_long';
    this.errors.set(errors);
    this.error.set(null);
    if (Object.keys(errors).length > 0) return;
    this.busy.set(true);
    try {
      await this.data.submit({ name, description: description === '' ? null : description, visibility: this.visibility() });
      this.ref.close(true);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'validation_failed' && err.fields) this.errors.set(err.fields);
      else this.error.set(errorKey(err));
    } finally {
      this.busy.set(false);
    }
  }
}
