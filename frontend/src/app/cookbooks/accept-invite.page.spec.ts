import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { en, provideTestTransloco, settle } from '../testing/transloco';
import { AcceptInvitePage } from './accept-invite.page';
import { CookbookApi } from './cookbook.api';

const problem = (status: number, code: string) =>
  new HttpErrorResponse({ status, error: { status, code, title: code } });

async function mount(api: Partial<CookbookApi>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]), provideTestTransloco(), { provide: CookbookApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'TOK' }) } } },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(AcceptInvitePage);
  await settle(f);
  return { f, el: f.nativeElement as HTMLElement, nav };
}
const btn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button, a')).find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const preview = { cookbookName: 'Weeknight', owner: { username: 'ann', displayName: 'ANN', avatarUrl: null }, expiresAt: '2026-11-11T10:00:00Z' };

describe('AcceptInvitePage', () => {
  it('shows the cookbook and its owner, and Accept goes to the cookbook', async () => {
    const acceptInvite = vi.fn().mockResolvedValue({ id: 'c9' });
    const { f, el, nav } = await mount({ previewInvite: vi.fn().mockResolvedValue(preview), acceptInvite });
    expect(el.textContent).toContain('Weeknight');
    expect(el.textContent).toContain('ANN');
    btn(el, en.cookbooks.accept)!.click();
    await settle(f);
    expect(acceptInvite).toHaveBeenCalledWith('TOK');
    expect(nav).toHaveBeenCalledWith('/cookbooks/c9');
  });

  it('Not now goes to the cookbooks list without accepting', async () => {
    const acceptInvite = vi.fn();
    const { el } = await mount({ previewInvite: vi.fn().mockResolvedValue(preview), acceptInvite });
    expect(btn(el, en.cookbooks.notNow)!.getAttribute('href')).toBe('/cookbooks');
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('an invalid invite shows the error', async () => {
    const { el } = await mount({ previewInvite: vi.fn().mockRejectedValue(problem(404, 'cookbook_invite_invalid')) });
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.cookbook_invite_invalid);
    expect(btn(el, en.cookbooks.accept)).toBeUndefined();
  });

  it('already a member shows the error with a link to the cookbooks', async () => {
    const { f, el } = await mount({
      previewInvite: vi.fn().mockResolvedValue(preview), acceptInvite: vi.fn().mockRejectedValue(problem(409, 'already_member')),
    });
    btn(el, en.cookbooks.accept)!.click();
    await settle(f);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(en.errors.already_member);
    expect(el.querySelector('a[href="/cookbooks"]')).toBeTruthy();
  });
});
