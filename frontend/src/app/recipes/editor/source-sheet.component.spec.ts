import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { EditorStore } from './editor-store';
import { fakeEditorStore } from './editor-store.testing';
import { SourceSheetComponent } from './source-sheet.component';

describe('SourceSheetComponent', () => {
  it('edits the source as you type; blank becomes null', async () => {
    const store = fakeEditorStore({ source: 'Nonna' });
    TestBed.configureTestingModule({
      providers: [
        provideTestTransloco(),
        { provide: EditorStore, useValue: store },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(SourceSheetComponent);
    await settle(f);
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain(
      en.editor.sourceSheet.label,
    );
    expect(input.value).toBe('Nonna');
    expect(input.maxLength).toBe(500);
    input.value = 'Ottolenghi, Simple p.112';
    input.dispatchEvent(new Event('input'));
    expect(store.recipe().source).toBe('Ottolenghi, Simple p.112');
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    expect(store.recipe().source).toBeNull();
  });
});
