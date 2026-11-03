import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { formatAmount, parseAmount } from '../amount';
import { Group, Ingredient, RecipeInput, UNITS, Unit } from '../recipe.model';
import { countingIngredients, countsIngredient, unnamedRows } from './completeness';
import { uid } from './editor-sheet';
import { EditorStore } from './editor-store';

export const MAX_GROUPS = 20;
export const MAX_INGREDIENTS = 200;
export const MAX_INGREDIENT_NAME = 200;
export const MAX_GROUP_NAME = 100;

const BLANK: Ingredient = { amount: null, unit: null, name: '', note: null };

/**
 * Ingredient groups. The amount field keeps what the person types (never reformatted mid-typing); the
 * store gets the parsed number, and an invalid text shows an inline error and is never stored.
 * Rows are not reorderable in this plan.
 */
@Component({
  selector: 'app-ingredients-editor',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ingredients-editor.component.scss',
  template: `
    <ng-container *transloco="let t">
      @let groups = store.recipe().groups;
      @for (g of groups; track $index; let gi = $index) {
        <div class="ing-group">
          <div class="group-head">
            <div class="field grow">
              <label [for]="id(gi, -1, 'group')">{{ t('editor.groupName') }}</label>
              <input type="text" [id]="id(gi, -1, 'group')" class="group-name" [maxLength]="maxGroupName"
                [placeholder]="t('editor.groupNamePlaceholder')" [value]="g.name ?? ''"
                (input)="setGroupName(gi, $any($event.target).value)" />
            </div>
            <button type="button" class="btn delete-group" [disabled]="!canDeleteGroup(g)"
              [attr.aria-describedby]="published() && total() <= 1 ? hintId : null" (click)="deleteGroup(gi)">
              {{ t('editor.deleteGroup') }}
            </button>
          </div>
          @for (ing of g.ingredients; track $index; let ii = $index) {
            <div class="ing-row">
              <div class="field amount-field">
                <label [for]="id(gi, ii, 'amount')">{{ t('editor.amount') }}</label>
                <input type="text" inputmode="decimal" class="amount" [id]="id(gi, ii, 'amount')"
                  [value]="amountText(gi, ii, ing)" [attr.aria-invalid]="amountInvalid(gi, ii)"
                  [attr.aria-describedby]="amountInvalid(gi, ii) ? id(gi, ii, 'amount-error') : null"
                  (input)="setAmount(gi, ii, $any($event.target).value)" />
              </div>
              <div class="field unit-field">
                <label [for]="id(gi, ii, 'unit')">{{ t('editor.unit') }}</label>
                <select class="unit" [id]="id(gi, ii, 'unit')" (change)="setUnit(gi, ii, $any($event.target).value)">
                  <option value="" [selected]="ing.unit === null">{{ t('editor.noUnit') }}</option>
                  @for (u of units; track u) {
                    <option [value]="u" [selected]="ing.unit === u">{{ t('units.' + u) }}</option>
                  }
                </select>
              </div>
              <div class="field name-field">
                <label [for]="id(gi, ii, 'name')">{{ t('editor.ingredientName') }}</label>
                <input type="text" class="name" [id]="id(gi, ii, 'name')" [maxLength]="maxName" [value]="ing.name"
                  (input)="patch(gi, ii, { name: $any($event.target).value })" />
              </div>
              <div class="field note-field">
                <label [for]="id(gi, ii, 'note')">{{ t('editor.ingredientNote') }}</label>
                <input type="text" class="note" [id]="id(gi, ii, 'note')" [maxLength]="maxName" [value]="ing.note ?? ''"
                  (input)="patch(gi, ii, { note: $any($event.target).value === '' ? null : $any($event.target).value })" />
              </div>
              <button type="button" class="btn icon delete-ingredient" [disabled]="!canDeleteIngredient(ing)"
                [attr.aria-label]="ing.name.trim()
                  ? t('editor.deleteIngredientNamed', { name: ing.name.trim() })
                  : t('editor.deleteIngredientNumbered', { n: rowNumber(gi, ii) })"
                [attr.aria-describedby]="published() && total() <= 1 ? hintId : null" (click)="deleteIngredient(gi, ii)">
                <span aria-hidden="true">✕</span>
              </button>
              @if (amountInvalid(gi, ii)) {
                <p class="field-error amount-error" [id]="id(gi, ii, 'amount-error')">{{ t('editor.amountInvalid') }}</p>
              }
            </div>
          }
          @if (groups.length > 0) {
            <button type="button" class="btn add-ingredient" [id]="id(gi, -1, 'add')" [disabled]="count() >= maxIngredients"
              (click)="addIngredient(gi)">{{ t('editor.addIngredient') }}</button>
          }
        </div>
      }
      <div class="ing-actions">
        @if (groups.length === 0) {
          <button type="button" class="btn add-ingredient" [id]="id(0, -1, 'add')" (click)="addIngredient(0)">{{ t('editor.addIngredient') }}</button>
        } @else {
          <button type="button" class="btn add-group" [disabled]="groups.length >= maxGroups" (click)="addGroup()">
            {{ t('editor.addGroup') }}
          </button>
        }
      </div>
      @if (published() && total() <= 1) {
        <p class="hint" [id]="hintId">{{ t('editor.needsOne') }}</p>
      }
    </ng-container>
  `,
})
export class IngredientsEditorComponent {
  protected readonly store = inject(EditorStore);
  private readonly injector = inject(Injector);
  private readonly base = uid('ing');
  protected readonly hintId = this.base + '-hint';
  protected readonly units: readonly Unit[] = UNITS;
  protected readonly maxGroups = MAX_GROUPS;
  protected readonly maxIngredients = MAX_INGREDIENTS;
  protected readonly maxName = MAX_INGREDIENT_NAME;
  protected readonly maxGroupName = MAX_GROUP_NAME;
  /** What the person typed in each amount field, by "group.row"; absent = show the stored amount. */
  private readonly texts = signal<Record<string, string>>({});

  protected readonly published = computed(() => this.store.server()?.status === 'PUBLISHED');
  /** Ingredients that count for publishing (non-blank name). */
  protected readonly total = computed(() => countingIngredients(this.store.recipe().groups));
  protected readonly count = computed(() => this.store.recipe().groups.reduce((n, g) => n + g.ingredients.length, 0));

  protected readonly invalidKeys = computed(() =>
    Object.entries(this.texts()).filter(([, t]) => parseAmount(t) === 'invalid').map(([k]) => k),
  );

  constructor() {
    // A server copy replaced the working copy (publish, Load latest): drop typed text.
    effect(() => {
      this.store.epoch();
      untracked(() => this.texts.set({}));
    });
    // Tell the store how many amounts are invalid (status "not saved: fix", Publish refuses).
    effect(() => {
      const n = this.invalidKeys().length;
      untracked(() => this.store.setInvalidAmounts(n));
    });
  }

  /** Scrolls to and focuses the first problem: an invalid amount, else a nameless row holding data. */
  focusFirstProblem(): void {
    const key = [...this.invalidKeys()].sort((a, b) => {
      const [ag, ai] = a.split('.').map(Number);
      const [bg, bi] = b.split('.').map(Number);
      return ag - bg || ai - bi;
    })[0];
    let target: string | null = null;
    if (key) {
      const [g, i] = key.split('.').map(Number);
      target = this.id(g, i, 'amount');
    } else {
      const first = unnamedRows(this.store.recipe().groups)[0];
      if (first) target = this.id(first[0], first[1], 'name');
    }
    const el = target ? document.getElementById(target) : null;
    el?.scrollIntoView?.({ block: 'center' });
    el?.focus();
  }

  /** 1-based position of a row across all groups (names an unnamed row's delete button). */
  protected rowNumber(g: number, i: number): number {
    return this.store.recipe().groups.slice(0, g).reduce((n, grp) => n + grp.ingredients.length, 0) + i + 1;
  }

  protected id = (g: number, i: number, part: string) => `${this.base}-${g}-${i}-${part}`;

  protected canDeleteIngredient(ing: Ingredient): boolean {
    return !this.published() || !countsIngredient(ing.name) || this.total() > 1;
  }
  protected canDeleteGroup(g: Group): boolean {
    if (!this.published()) return true;
    return this.total() - countingIngredients([g]) >= 1;
  }

  protected amountText(g: number, i: number, ing: Ingredient): string {
    const typed = this.texts()[`${g}.${i}`];
    if (typed !== undefined) {
      const p = parseAmount(typed);
      if (p === 'invalid' || p === ing.amount) return typed;
    }
    return formatAmount(ing.amount);
  }
  protected amountInvalid(g: number, i: number): boolean {
    const typed = this.texts()[`${g}.${i}`];
    return typed !== undefined && parseAmount(typed) === 'invalid';
  }

  protected setAmount(g: number, i: number, text: string): void {
    this.texts.update((t) => ({ ...t, [`${g}.${i}`]: text }));
    const p = parseAmount(text);
    if (p !== 'invalid') this.patch(g, i, { amount: p });
  }
  protected setUnit(g: number, i: number, value: string): void {
    this.patch(g, i, { unit: value === '' ? null : (value as Unit) });
  }

  protected patch(g: number, i: number, change: Partial<Ingredient>): void {
    this.edit((groups) =>
      groups.map((grp, gi) =>
        gi !== g ? grp : { ...grp, ingredients: grp.ingredients.map((ing, ii) => (ii === i ? { ...ing, ...change } : ing)) },
      ),
    );
  }
  protected setGroupName(g: number, value: string): void {
    this.edit((groups) => groups.map((grp, gi) => (gi === g ? { ...grp, name: value === '' ? null : value } : grp)));
  }

  protected addIngredient(g: number): void {
    this.edit((groups) =>
      groups.length === 0
        ? [{ name: null, ingredients: [{ ...BLANK }] }]
        : groups.map((grp, gi) => (gi === g ? { ...grp, ingredients: [...grp.ingredients, { ...BLANK }] } : grp)),
    );
    const row = (this.store.recipe().groups[g]?.ingredients.length ?? 1) - 1;
    afterNextRender(() => (document.getElementById(this.id(g, row, 'name')) as HTMLElement | null)?.focus(), {
      injector: this.injector,
    });
  }
  protected addGroup(): void {
    this.edit((groups) => [...groups, { name: null, ingredients: [] }]);
  }
  protected deleteIngredient(g: number, i: number): void {
    this.rekey((gi, ii) => (gi !== g ? [gi, ii] : ii === i ? null : [gi, ii > i ? ii - 1 : ii]));
    this.edit((groups) =>
      groups.map((grp, gi) => (gi === g ? { ...grp, ingredients: grp.ingredients.filter((_, ii) => ii !== i) } : grp)),
    );
    // focus the previous row's name, else the next one's (now at the same index), else the group's add button
    const left = this.store.recipe().groups[g]?.ingredients.length ?? 0;
    this.focusLater(i > 0 ? this.id(g, i - 1, 'name') : left > 0 ? this.id(g, 0, 'name') : this.id(g, -1, 'add'));
  }
  protected deleteGroup(g: number): void {
    this.rekey((gi, ii) => (gi === g ? null : [gi > g ? gi - 1 : gi, ii]));
    this.edit((groups) => groups.filter((_, gi) => gi !== g));
    const n = this.store.recipe().groups.length;
    this.focusLater(g > 0 ? this.id(g - 1, -1, 'group') : n > 0 ? this.id(0, -1, 'group') : this.id(0, -1, 'add'));
  }

  /** Moves typed amount texts to their new row positions after a delete (`null` drops the entry). */
  private rekey(map: (g: number, i: number) => [number, number] | null): void {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.texts())) {
      const [g, i] = k.split('.').map(Number);
      const m = map(g, i);
      if (m) next[`${m[0]}.${m[1]}`] = v;
    }
    this.texts.set(next);
  }

  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  private edit(fn: (groups: Group[]) => Group[]): void {
    this.store.update((r: RecipeInput) => ({ ...r, groups: fn(r.groups) }));
  }
}
