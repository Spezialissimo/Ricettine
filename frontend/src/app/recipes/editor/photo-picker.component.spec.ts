import { TestBed } from '@angular/core/testing';
import { en, provideTestTransloco, settle } from '../../testing/transloco';
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT, PhotoPickerComponent } from './photo-picker.component';

async function mount(capture = false) {
  TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
  const f = TestBed.createComponent(PhotoPickerComponent);
  f.componentRef.setInput('label', 'Add photo');
  f.componentRef.setInput('ariaLabel', 'Add photo to step 2');
  f.componentRef.setInput('capture', capture);
  const picked: File[] = [];
  const rejected: string[] = [];
  f.componentInstance.picked.subscribe((x) => picked.push(x));
  f.componentInstance.rejected.subscribe((x) => rejected.push(x));
  await settle(f);
  const el = f.nativeElement as HTMLElement;
  const input = el.querySelector('input[type="file"]') as HTMLInputElement;
  const choose = (file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  return { f, el, input, picked, rejected, choose };
}
const file = (size: number, type = 'image/jpeg') => new File([new Uint8Array(size)], 'p.jpg', { type });

describe('PhotoPickerComponent', () => {
  it('has a hidden image input and an accessible button that opens it', async () => {
    const { el, input } = await mount();
    expect(input.accept).toBe(PHOTO_ACCEPT);
    expect(PHOTO_ACCEPT).toBe('image/jpeg,image/png,image/webp');
    expect(input.hasAttribute('capture')).toBe(false);
    expect(input.hidden || input.getAttribute('aria-hidden') === 'true').toBe(true);
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Add photo');
    expect(button.getAttribute('aria-label')).toBe('Add photo to step 2');
    const click = vi.spyOn(input, 'click');
    button.click();
    expect(click).toHaveBeenCalled();
  });

  it('asks the camera when capture is set', async () => {
    const { input } = await mount(true);
    expect(input.getAttribute('capture')).toBe('environment');
  });

  it('emits the picked file', async () => {
    const { picked, rejected, choose } = await mount();
    const f = file(1000);
    choose(f);
    expect(picked).toEqual([f]);
    expect(rejected).toEqual([]);
  });

  it('rejects a non-image file client-side, like a drop does', async () => {
    const { picked, rejected, choose } = await mount();
    choose(file(10, 'application/pdf'));
    expect(picked).toEqual([]);
    expect(rejected).toEqual(['errors.unsupported_image']);
  });

  it('rejects a 16 MB file client-side', async () => {
    const { picked, rejected, choose } = await mount();
    choose(file(16 * 1024 * 1024));
    expect(picked).toEqual([]);
    expect(rejected).toEqual(['errors.file_too_large']);
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024);
    expect(en.errors.file_too_large).toBeTruthy();
  });
});
