import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco } from '../../testing/transloco';
import { settle } from '../../testing/spec-helpers';
import { RecipeApi } from '../recipe.api';
import { serverRecipe } from './editor-store.testing';
import { RecipeEditorPage } from './recipe-editor.page';

/** A drag event carrying files (jsdom has no DataTransfer). */
function fileDrag(type: string): DragEvent {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })],
      types: ['Files'],
      dropEffect: 'copy',
    },
  });
  return ev;
}

/** A paste carrying `files`, and `text` if given (jsdom has no ClipboardEvent data). */
function pasteEvent(files: File[], text?: string): ClipboardEvent {
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  const types = text === undefined ? ['Files'] : ['text/plain', 'text/html', 'Files'];
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      files,
      items: [],
      types,
      getData: (t: string) => (t === 'text/plain' ? (text ?? '') : ''),
    },
  });
  return ev;
}
const image = () => new File(['x'], 'shot.png', { type: 'image/png' });

async function mount(uploadPhoto = vi.fn().mockReturnValue(new Promise(() => {}))) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTransloco(),
      {
        provide: RecipeApi,
        useValue: {
          get: vi.fn().mockResolvedValue(
            serverRecipe({
              title: 'T',
              steps: [
                { text: 'Boil', photo: null },
                { text: 'Serve', photo: null },
              ],
            }),
          ),
          uploadPhoto,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r1' }) } },
      },
    ],
  });
  const f = TestBed.createComponent(RecipeEditorPage);
  document.body.appendChild(f.nativeElement);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, uploadPhoto };
}

describe('RecipeEditorPage: dragging photos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('app-recipe-editor-page').forEach((e) => e.remove());
  });

  it('labels every drop target while a file is dragged over the page, and stops after the drag', async () => {
    const { f, el } = await mount();
    expect(el.querySelector('.cover')?.getAttribute('data-drop-label')).toBe(en.editor.dropHere);
    expect(el.querySelector('li.step')?.getAttribute('data-drop-label')).toBe(en.editor.dropHere);
    expect(el.classList.contains('dragging-files')).toBe(false);

    window.dispatchEvent(fileDrag('dragover'));
    await f.whenStable();
    expect(el.classList.contains('dragging-files')).toBe(true);

    vi.advanceTimersByTime(300); // no more dragover: the drag left the window or ended
    await f.whenStable();
    expect(el.classList.contains('dragging-files')).toBe(false);
  });

  it('a drop outside the cover and the steps keeps the editor and says where to drop', async () => {
    const { f, el } = await mount();
    const over = fileDrag('dragover');
    document.body.dispatchEvent(over);
    // taken here, so the browser delivers the drop (and does not open the image in the tab)
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer!.dropEffect).toBe('copy');

    const drop = fileDrag('drop');
    document.body.dispatchEvent(drop);
    await f.whenStable();
    expect(drop.defaultPrevented).toBe(true);
    expect(el.querySelector('.drop-missed')?.textContent).toContain(en.editor.dropMissed);
    expect(el.classList.contains('dragging-files')).toBe(false);

    vi.advanceTimersByTime(5100);
    await f.whenStable();
    expect(el.querySelector('.drop-missed')).toBeNull();
  });

  it('shows "or drag a photo here" on an empty cover', async () => {
    const { el } = await mount();
    expect(el.querySelector('.cover .drop-hint')?.textContent).toContain(en.editor.dropHint);
  });

  it("pasting an image while writing a step makes it that step's photo", async () => {
    const { f, el, uploadPhoto } = await mount();
    const step2 = el.querySelectorAll<HTMLTextAreaElement>('li.step textarea')[1];
    step2.focus();
    const ev = pasteEvent([image()]);
    step2.dispatchEvent(ev);
    await f.whenStable();
    expect(ev.defaultPrevented).toBe(true);
    expect(uploadPhoto).toHaveBeenCalledWith('r1', expect.any(File));
    expect(el.querySelectorAll('li.step')[1].textContent).toContain(en.editor.uploading);
    expect(el.querySelector('.cover')?.textContent).not.toContain(en.editor.uploading);
  });

  it('pasting an image anywhere else sets the cover', async () => {
    const { f, el, uploadPhoto } = await mount();
    const title = el.querySelector<HTMLInputElement>('#recipe-title')!;
    title.focus();
    title.dispatchEvent(pasteEvent([image()]));
    await f.whenStable();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.cover')?.textContent).toContain(en.editor.uploading);
  });

  it('a text paste is left alone', async () => {
    const { el, uploadPhoto } = await mount();
    const ev = pasteEvent([]);
    el.querySelector<HTMLInputElement>('#recipe-title')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('text from an office app, which also carries a picture of itself, is pasted as text', async () => {
    const { el, uploadPhoto } = await mount();
    const step = el.querySelector<HTMLTextAreaElement>('li.step textarea')!;
    step.focus();
    const ev = pasteEvent([image()], 'Whisk the eggs');
    step.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('a pasted file that is not an image is refused with a message on the target', async () => {
    const { f, el, uploadPhoto } = await mount();
    const ev = pasteEvent([new File(['x'], 'a.png', { type: 'image/png' })]);
    Object.defineProperty(ev.clipboardData!.files[0], 'size', { value: 16 * 1024 * 1024 });
    document.body.dispatchEvent(ev);
    await f.whenStable();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(el.querySelector('.cover')?.textContent).toContain(en.errors.file_too_large);
  });
});
