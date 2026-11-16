import { TestBed } from '@angular/core/testing';
import { AvatarComponent } from './avatar.component';

function mount(inputs: Record<string, unknown>) {
  const f = TestBed.createComponent(AvatarComponent);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('AvatarComponent', () => {
  it('shows the photo, decorative by default, when there is a URL', () => {
    const el = mount({ name: 'Ann', avatarUrl: '/media/a.jpg' });
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/media/a.jpg');
    expect(img?.getAttribute('alt')).toBe('');
    expect(el.querySelector('.initial')).toBeNull();
  });

  it('uses the given alt text for the photo', () => {
    expect(
      mount({ name: 'Ann', avatarUrl: '/media/a.jpg', alt: 'Your photo' }).querySelector('img')
        ?.alt,
    ).toBe('Your photo');
  });

  it('shows the uppercase initial, hidden from screen readers, without a photo', () => {
    const el = mount({ name: 'ann', avatarUrl: null });
    const i = el.querySelector('.initial');
    expect(i?.textContent?.trim()).toBe('A');
    expect(i?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('img')).toBeNull();
  });

  it('falls back to ? for an empty name', () => {
    expect(mount({ name: '' }).querySelector('.initial')?.textContent?.trim()).toBe('?');
  });
});
