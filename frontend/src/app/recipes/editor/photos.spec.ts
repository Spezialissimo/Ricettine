import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { RecipeApi } from '../recipe.api';
import { Photo } from '../recipe.model';
import { EditorStore } from './editor-store';
import { serverRecipe } from './editor-store.testing';
import { StepsEditorComponent } from './steps-editor.component';

const photo = (id: string): Photo => ({ mediaId: id, thumbUrl: `/media/${id}/thumb.jpg`, displayUrl: `/media/${id}/display.jpg` });
const jpeg = (size = 1000, type = 'image/jpeg') => new File([new Uint8Array(size)], 'p.jpg', { type });

async function mount(api: Partial<RecipeApi>, steps = ['Boil', 'Serve']) {
  const fullApi = {
    get: vi.fn().mockResolvedValue(serverRecipe({ steps: steps.map((text) => ({ text, photo: null })) })),
    save: vi.fn().mockImplementation(async () => serverRecipe({ version: 2 })),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [provideTestTransloco(), EditorStore, { provide: RecipeApi, useValue: fullApi }],
  });
  const store = TestBed.inject(EditorStore);
  await store.load('r1');
  const f = TestBed.createComponent(StepsEditorComponent);
  document.body.appendChild(f.nativeElement);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, store, api: fullApi };
}
const choose = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
};
const inputs = (el: HTMLElement) => Array.from(el.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
const stepEl = (el: HTMLElement, i: number) => el.querySelectorAll('li.step')[i] as HTMLElement;
const buttonNamed = (root: HTMLElement, name: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name) as HTMLButtonElement | undefined;

function dropEvent(type: string, files: File[]): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { files, types: ['Files'], dropEffect: 'none' } });
  return ev;
}

describe('step photos', () => {
  let created: string[];
  let revoked: string[];
  beforeEach(() => {
    created = [];
    revoked = [];
    URL.createObjectURL = vi.fn(() => {
      created.push(`blob:${created.length}`);
      return created[created.length - 1];
    });
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  });
  afterEach(() => document.querySelectorAll('app-steps-editor').forEach((e) => e.remove()));

  it('shows the local preview with "Uploading…", then the server thumb, and stores photoMediaId', async () => {
    let finish!: (p: Photo) => void;
    const { f, el, store, api } = await mount({ uploadPhoto: vi.fn().mockReturnValue(new Promise<Photo>((r) => (finish = r))) });
    choose(inputs(el)[1], jpeg());
    await settle(f);
    expect(api.uploadPhoto).toHaveBeenCalledWith('r1', expect.any(File));
    expect(el.textContent).toContain(en.editor.uploading);
    expect(stepEl(el, 1).querySelector('img.photo-preview')?.getAttribute('src')).toBe('blob:0');
    expect(store.uploading()).toBe(true);
    expect(store.recipe().steps[1].photoMediaId).toBeNull();

    finish(photo('m1'));
    await settle(f);
    expect(store.recipe().steps[1].photoMediaId).toBe('m1');
    expect(store.uploading()).toBe(false);
    const thumb = stepEl(el, 1).querySelector('img.photo-thumb') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe('/media/m1/thumb.jpg');
    expect(thumb.alt).toBe('Photo of step 2');
    // the preview is dropped (and its object URL revoked) once the thumb has loaded
    expect(revoked).toEqual([]);
    thumb.dispatchEvent(new Event('load'));
    await settle(f);
    expect(stepEl(el, 1).querySelector('img.photo-preview')).toBeNull();
    expect(revoked).toEqual(['blob:0']);
    expect(el.textContent).not.toContain(en.editor.uploading);
  });

  it('offers Add photo / Replace / Remove with the step number in their names, and Remove clears the reference', async () => {
    const { f, el, store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('m1')) });
    expect(buttonNamed(el, 'Add photo to step 1')?.textContent?.trim()).toBe('Add photo');
    expect(buttonNamed(el, 'Add photo to step 2')).toBeTruthy();
    choose(inputs(el)[0], jpeg());
    await settle(f);
    expect(buttonNamed(el, 'Add photo to step 1')).toBeUndefined();
    expect(buttonNamed(el, 'Replace photo of step 1')?.textContent?.trim()).toBe('Replace');
    buttonNamed(el, 'Remove photo of step 1')!.click();
    await settle(f);
    expect(store.recipe().steps[0].photoMediaId).toBeNull();
    expect(stepEl(el, 0).querySelector('img.photo-thumb')).toBeNull();
    expect(buttonNamed(el, 'Add photo to step 1')).toBeTruthy();
  });

  it('shows the error key when the upload fails, and keeps the reference empty', async () => {
    const { f, el, store } = await mount({
      uploadPhoto: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 415, error: { code: 'unsupported_image' } })),
    });
    choose(inputs(el)[0], jpeg());
    await settle(f);
    expect(el.textContent).toContain(en.errors.unsupported_image);
    expect(store.recipe().steps[0].photoMediaId).toBeNull();
    expect(store.uploading()).toBe(false);
  });

  it('rejects a 16 MB file with the file_too_large message and never uploads it', async () => {
    const { f, el, api } = await mount({ uploadPhoto: vi.fn() });
    choose(inputs(el)[0], jpeg(16 * 1024 * 1024));
    await settle(f);
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    expect(el.textContent).toContain(en.errors.file_too_large);
  });

  it('drop: highlights on dragover, uploads the first dropped file onto that step', async () => {
    const { f, el, store, api } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('m2')) });
    const li = stepEl(el, 1);
    const over = dropEvent('dragover', [jpeg()]);
    li.dispatchEvent(over);
    await settle(f);
    expect(over.defaultPrevented).toBe(true);
    expect(li.classList.contains('drop-over')).toBe(true);
    const first = jpeg(10);
    li.dispatchEvent(dropEvent('drop', [first, jpeg(20)]));
    await settle(f);
    expect(li.classList.contains('drop-over')).toBe(false);
    expect(api.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(api.uploadPhoto).toHaveBeenCalledWith('r1', first);
    expect(store.recipe().steps[1].photoMediaId).toBe('m2');
  });

  it('drop: a non-image file shows the unsupported message', async () => {
    const { f, el, api } = await mount({ uploadPhoto: vi.fn() });
    stepEl(el, 0).dispatchEvent(dropEvent('drop', [jpeg(10, 'application/pdf')]));
    await settle(f);
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    expect(el.textContent).toContain(en.errors.unsupported_image);
  });

  it('attachPhoto goes to the last tapped step', async () => {
    const { f, el, store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('m3')) }, ['a', 'b', 'c']);
    stepEl(el, 0).querySelector('textarea')!.dispatchEvent(new Event('focusin', { bubbles: true }));
    await f.componentInstance.attachPhoto(jpeg());
    expect(store.recipe().steps.map((s) => s.photoMediaId)).toEqual(['m3', null, null]);
  });

  it('attachPhoto goes to the last step when none was tapped', async () => {
    const { f, store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('m4')) }, ['a', 'b']);
    await f.componentInstance.attachPhoto(jpeg());
    expect(store.recipe().steps.map((s) => s.photoMediaId)).toEqual([null, 'm4']);
  });

  it('attachPhoto with no steps creates one first', async () => {
    const { f, store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('m5')) }, []);
    await f.componentInstance.attachPhoto(jpeg());
    expect(store.recipe().steps).toEqual([{ text: '', photoMediaId: 'm5' }]);
  });

  it('revokes pending previews when the store is destroyed', async () => {
    const { f, el } = await mount({ uploadPhoto: vi.fn().mockReturnValue(new Promise(() => {})) });
    choose(inputs(el)[0], jpeg());
    await settle(f);
    TestBed.resetTestingModule();
    expect(revoked).toEqual(['blob:0']);
  });
});

describe('cover photo and photo_not_in_recipe', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:c');
    URL.revokeObjectURL = vi.fn();
  });

  it('a cover upload stores coverMediaId', async () => {
    const { store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('c1')) });
    await store.uploadPhoto('cover', jpeg());
    expect(store.recipe().coverMediaId).toBe('c1');
    expect(store.photoOf('c1')?.thumbUrl).toBe('/media/c1/thumb.jpg');
    store.removePhoto('cover');
    expect(store.recipe().coverMediaId).toBeNull();
  });

  it('a save refused with photo_not_in_recipe drops only the ids the server names, says so, and saves again', async () => {
    try {
      const gone = new HttpErrorResponse({ status: 400, error: { code: 'photo_not_in_recipe', mediaIds: ['stale'] } });
      const save = vi.fn().mockRejectedValueOnce(gone).mockImplementation(async () => serverRecipe({ version: 2 }));
      const uploadPhoto = vi.fn().mockResolvedValueOnce(photo('stale')).mockResolvedValueOnce(photo('fresh'));
      const { store } = await mount({ uploadPhoto, save });
      vi.useFakeTimers();
      await store.uploadPhoto(0, jpeg());
      await store.uploadPhoto('cover', jpeg());
      await vi.advanceTimersByTimeAsync(1000);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][1].steps[0].photoMediaId).toBeNull();
      expect(save.mock.calls[1][1].coverMediaId).toBe('fresh');
      expect(store.recipe().coverMediaId).toBe('fresh');
      expect(store.recipe().steps[0].photoMediaId).toBeNull();
      expect(store.photoGone()).toBe(true);
      expect(store.status()).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('without mediaIds nothing is dropped and the error shows', async () => {
    try {
      const gone = new HttpErrorResponse({ status: 400, error: { code: 'photo_not_in_recipe' } });
      const save = vi.fn().mockRejectedValue(gone);
      const { store } = await mount({ uploadPhoto: vi.fn().mockResolvedValue(photo('a')), save });
      vi.useFakeTimers();
      await store.uploadPhoto('cover', jpeg());
      await vi.advanceTimersByTimeAsync(1000);
      expect(save).toHaveBeenCalledTimes(1);
      expect(store.recipe().coverMediaId).toBe('a');
      expect(store.photoGone()).toBe(false);
      expect(store.saveError()).toBe('errors.photo_not_in_recipe');
    } finally {
      vi.useRealTimers();
    }
  });

  it('publish() refuses while a photo is uploading', async () => {
    const publish = vi.fn();
    const { store } = await mount({ uploadPhoto: vi.fn().mockReturnValue(new Promise(() => {})), publish });
    void store.uploadPhoto('cover', jpeg());
    expect(await store.publish()).toBe('blocked');
    expect(publish).not.toHaveBeenCalled();
  });
});
