import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { Group } from '../recipe.model';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';
import { IngredientsEditorComponent } from './ingredients-editor.component';

const ing = (name: string, amount: number | null = null) => ({
  amount,
  unit: null,
  name,
  note: null,
});
const group = (name: string | null, ...names: string[]): Group => ({
  name,
  ingredients: names.map((n) => ing(n)),
});

async function mount(groups: Group[] = [], status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  const store = fakeEditorStore({ groups }, status);
  TestBed.configureTestingModule({
    providers: [provideTestTransloco(), { provide: EditorStore, useValue: store }],
  });
  const f = TestBed.createComponent(IngredientsEditorComponent);
  document.body.appendChild(f.nativeElement);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, store };
}
const byText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement;
const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input'));
};

describe('IngredientsEditorComponent', () => {
  it('adds a first ingredient (creating a group), more ingredients, and groups', async () => {
    const { f, el, store } = await mount();
    byText(el, en.editor.addIngredient).click();
    await settle(f);
    expect(store.recipe().groups).toEqual([{ name: null, ingredients: [ing('')] }]);
    byText(el, en.editor.addIngredient).click();
    byText(el, en.editor.addGroup).click();
    await settle(f);
    expect(store.recipe().groups.map((g) => g.ingredients.length)).toEqual([2, 0]);
    expect(el.querySelectorAll('.ing-group').length).toBe(2);
  });

  it('edits amount, unit, name and note; every field has a visible label', async () => {
    const { f, el, store } = await mount([group(null, '')]);
    type(el.querySelector('input.amount') as HTMLInputElement, '1 1/2');
    const unit = el.querySelector('select.unit') as HTMLSelectElement;
    unit.value = 'kg';
    unit.dispatchEvent(new Event('change'));
    type(el.querySelector('input.name') as HTMLInputElement, 'flour');
    type(el.querySelector('input.note') as HTMLInputElement, 'sifted');
    await settle(f);
    expect(store.recipe().groups[0].ingredients[0]).toEqual({
      amount: 1.5,
      unit: 'kg',
      name: 'flour',
      note: 'sifted',
    });
    expect(Array.from(unit.options).map((o) => o.value)).toEqual([
      '',
      'g',
      'kg',
      'ml',
      'l',
      'tsp',
      'tbsp',
      'cup',
      'piece',
      'pinch',
      'clove',
      'slice',
      'can',
      'bunch',
    ]);
    for (const sel of ['input.amount', 'select.unit', 'input.name', 'input.note']) {
      const id = el.querySelector(sel)!.id;
      expect(el.querySelector(`label[for="${id}"]`)?.textContent?.trim(), sel).toBeTruthy();
    }
  });

  it('the delete control is an icon button whose accessible name names its row', async () => {
    const { el } = await mount([group('A', 'flour', ''), group('B', ' milk ')]);
    const del = Array.from(el.querySelectorAll('button.delete-ingredient')) as HTMLButtonElement[];
    expect(del.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Delete ingredient flour',
      'Delete ingredient 2',
      'Delete ingredient milk',
    ]);
    expect(del[0].textContent?.trim()).toBe('✕');
  });

  it('keeps the typed amount text, never stores an invalid value, and links the error with aria-describedby', async () => {
    const { f, el, store } = await mount([group(null, 'milk')]);
    const amount = () => el.querySelector('input.amount') as HTMLInputElement;
    type(amount(), '2');
    await settle(f);
    type(amount(), '2x');
    await settle(f);
    expect(amount().value).toBe('2x');
    expect(store.recipe().groups[0].ingredients[0].amount).toBe(2); // last valid, invalid never stored
    expect(amount().getAttribute('aria-invalid')).toBe('true');
    const err = el.querySelector(`#${amount().getAttribute('aria-describedby')}`)!;
    expect(err.textContent).toContain(en.editor.amountInvalid);
    expect(err.closest('label')).toBeNull();
    type(amount(), '1/2');
    await settle(f);
    expect(amount().value).toBe('1/2'); // not reformatted while typing
    expect(store.recipe().groups[0].ingredients[0].amount).toBe(0.5);
    expect(amount().getAttribute('aria-invalid')).toBe('false');
    expect(amount().hasAttribute('aria-describedby')).toBe(false);
    type(amount(), '');
    await settle(f);
    expect(store.recipe().groups[0].ingredients[0].amount).toBeNull();
  });

  it('shows a stored amount through formatAmount', async () => {
    const { el } = await mount([{ name: null, ingredients: [ing('milk', 0.5)] }]);
    expect((el.querySelector('input.amount') as HTMLInputElement).value).toBe('0.5');
  });

  it('deletes a row and a group', async () => {
    const { f, el, store } = await mount([group('A', 'a1', 'a2'), group('B', 'b1')]);
    (el.querySelector('.ing-row button.delete-ingredient') as HTMLButtonElement).click();
    await settle(f);
    expect(store.recipe().groups[0].ingredients.map((i) => i.name)).toEqual(['a2']);
    (el.querySelectorAll('button.delete-group')[1] as HTMLButtonElement).click();
    await settle(f);
    expect(store.recipe().groups.map((g) => g.name)).toEqual(['A']);
  });

  it('on a published recipe, delete is disabled on the last counting ingredient, with a hint', async () => {
    const { f, el, store } = await mount([group(null, 'milk', '')], 'PUBLISHED');
    const del = () =>
      Array.from(el.querySelectorAll('button.delete-ingredient')) as HTMLButtonElement[];
    expect(del()[0].disabled).toBe(true); // the blank row does not count
    expect(del()[1].disabled).toBe(false);
    expect(el.textContent).toContain(en.editor.needsOne);
    expect((el.querySelector('button.delete-group') as HTMLButtonElement).disabled).toBe(true);
    del()[1].click();
    await settle(f);
    expect(store.recipe().groups[0].ingredients.length).toBe(1);
  });

  it('on a published recipe, deleting stays enabled while another counting ingredient remains', async () => {
    const { el } = await mount([group(null, 'milk', 'eggs')], 'PUBLISHED');
    for (const b of Array.from(
      el.querySelectorAll('button.delete-ingredient'),
    ) as HTMLButtonElement[])
      expect(b.disabled).toBe(false);
    expect(el.textContent).not.toContain(en.editor.needsOne);
  });

  describe('invalid amounts and deletes', () => {
    afterEach(() => document.querySelectorAll('app-ingredients-editor').forEach((e) => e.remove()));
    const amounts = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('input.amount')) as HTMLInputElement[];

    it('reports the number of invalid amounts to the store and focuses the first one on request', async () => {
      const { f, el, store } = await mount([group(null, 'a', 'b')]);
      type(amounts(el)[1], 'x');
      await settle(f);
      expect(store.invalidAmounts()).toBe(1);
      f.componentInstance.focusFirstProblem();
      expect(document.activeElement).toBe(amounts(el)[1]);
      type(amounts(el)[1], '3');
      await settle(f);
      expect(store.invalidAmounts()).toBe(0);
    });

    it('focusFirstProblem falls back to a nameless row that holds data', async () => {
      const { f, el } = await mount([
        { name: null, ingredients: [ing('milk'), { amount: 2, unit: null, name: '', note: null }] },
      ]);
      f.componentInstance.focusFirstProblem();
      expect(document.activeElement).toBe(el.querySelectorAll('input.name')[1]);
    });

    it('re-keys typed amount text when a row is deleted', async () => {
      const { f, el, store } = await mount([group(null, 'a', 'b')]);
      type(amounts(el)[1], '2x');
      await settle(f);
      (el.querySelector('button.delete-ingredient') as HTMLButtonElement).click(); // delete row 0
      await settle(f);
      expect(amounts(el)[0].value).toBe('2x');
      expect(amounts(el)[0].getAttribute('aria-invalid')).toBe('true');
      expect(store.invalidAmounts()).toBe(1);
    });

    it('drops typed text when a server copy replaces the working copy', async () => {
      const { f, el, store } = await mount([group(null, 'a')]);
      type(amounts(el)[0], '2x');
      await settle(f);
      store.bumpEpoch();
      await settle(f);
      expect(amounts(el)[0].value).toBe('');
      expect(store.invalidAmounts()).toBe(0);
    });

    it('reports the invalid texts themselves (for the local backup)', async () => {
      const { f, el, store } = await mount([group(null, 'a', 'b')]);
      type(amounts(el)[1], '1//2');
      await settle(f);
      expect(store.invalidAmountTexts()).toEqual({ '0.1': '1//2' });
    });

    it('shows amount text restored from the local backup when the restored copy arrives', async () => {
      const { f, el, store } = await mount([group(null, 'a', 'b')]);
      store.restoreAmountTexts({ '0.1': '1//2' });
      await settle(f);
      expect(amounts(el)[1].value).toBe('1//2');
      expect(amounts(el)[1].getAttribute('aria-invalid')).toBe('true');
      expect(store.invalidAmounts()).toBe(1);
    });

    it('focuses the neighbouring name (previous, else next) after deleting a row, else the add button', async () => {
      const { f, el } = await mount([group(null, 'a', 'b', 'c')]);
      const names = () => Array.from(el.querySelectorAll('input.name')) as HTMLInputElement[];
      const del = (i: number) =>
        (el.querySelectorAll('button.delete-ingredient')[i] as HTMLButtonElement).click();
      del(1);
      await settle(f);
      expect(document.activeElement).toBe(names()[0]);
      del(0);
      await settle(f);
      expect(document.activeElement).toBe(names()[0]); // the next one, now first
      del(0);
      await settle(f);
      expect(document.activeElement).toBe(el.querySelector('button.add-ingredient'));
    });

    it('focuses a neighbouring group after deleting a group', async () => {
      const { f, el } = await mount([group('A', 'a'), group('B', 'b')]);
      (el.querySelectorAll('button.delete-group')[1] as HTMLButtonElement).click();
      await settle(f);
      expect(document.activeElement).toBe(el.querySelector('input.group-name'));
    });
  });
});
