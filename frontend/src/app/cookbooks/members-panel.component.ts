import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { errorKey, toApiError } from '../core/api-error';
import { AuthStore } from '../core/auth.store';
import { mediaUrl } from '../core/media';
import { openSheet } from '../shared/sheet';
import { AppDatePipe } from '../shared/app-date.pipe';
import { CopyLinkComponent } from '../shared/copy-link.component';
import { CookbookApi } from './cookbook.api';
import { Cookbook, CookbookInvite, CookbookInviteCreated, Person } from './cookbook.model';
import { RemoveMemberDialog } from './remove-member.dialog';

/** Owner and co-authors. Owner: invite, revoke, remove. Author: leave. */
@Component({
  selector: 'app-members-panel',
  imports: [TranslocoDirective, CopyLinkComponent, AppDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use '../../styles/tokens' as t;
    :host { display: block; margin: 0 0 t.$space-4; }
    h2 { margin: 0 0 t.$space-2; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: t.$muted; font-weight: 600; }
    ul { list-style: none; margin: 0 0 t.$space-2; padding: 0; display: flex; flex-direction: column; gap: t.$space-2; }
    li { display: flex; align-items: center; gap: t.$space-3; justify-content: space-between; padding: t.$space-2 t.$space-3;
      background: t.$surface; border: 1px solid t.$border; border-radius: t.$radius; }
    .who { display: flex; align-items: center; gap: t.$space-2; min-width: 0; overflow-wrap: anywhere; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: t.$border; object-fit: cover; flex: none;
      display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; }
    .role { color: t.$muted; font-size: 0.8rem; }
    .muted { color: t.$muted; font-size: 0.85rem; }
    .alert { color: #b3261e; }
    button { @include t.touch-target; padding: 0 t.$space-4; border: 1px solid t.$border; border-radius: 10px;
      background: t.$bg; color: t.$ink; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
    .danger { color: #b3261e; border-color: #b3261e; }
  `,
  template: `
    <section *transloco="let t" aria-labelledby="cb-members-heading">
      <h2 id="cb-members-heading">{{ t('cookbooks.members') }}</h2>
      <ul class="members">
        @if (book().owner; as o) {
          <li data-member="owner">
            <span class="who">
              @if (src(o); as s) { <img class="avatar" [src]="s" alt="" /> } @else { <span class="avatar" aria-hidden="true">{{ initial(o) }}</span> }
              <span>{{ o.displayName }}</span>
            </span>
            <span class="role">{{ t('cookbooks.roleOwner') }}</span>
          </li>
        }
        @for (a of book().authors; track a.id ?? a.username) {
          <li data-member="author">
            <span class="who">
              @if (src(a); as s) { <img class="avatar" [src]="s" alt="" /> } @else { <span class="avatar" aria-hidden="true">{{ initial(a) }}</span> }
              <span>{{ a.displayName }}</span>
            </span>
            @if (book().role === 'OWNER' && a.id) {
              <button type="button" class="danger" [attr.aria-label]="t('cookbooks.removeMemberAria', { name: a.displayName })"
                (click)="remove(a)">{{ t('cookbooks.remove') }}</button>
            } @else {
              <span class="role">{{ t('cookbooks.roleAuthor') }}</span>
            }
          </li>
        }
      </ul>
      @if (book().role === 'OWNER') {
        <button type="button" [disabled]="busy()" (click)="invite()">{{ t('cookbooks.invite') }}</button>
        @if (created(); as c) {
          <app-copy-link [url]="c.url" [expiresAt]="c.expiresAt" />
        }
        @if (invites().length > 0) {
          <h2>{{ t('cookbooks.outstandingInvites') }}</h2>
          <ul class="invites">
            @for (i of invites(); track i.id) {
              <li class="invite" [attr.data-invite]="i.id">
                <span class="muted">{{ t('common.expiresOn', { date: (i.expiresAt | appDate: 'dateTime') }) }}</span>
                <button type="button" (click)="revoke(i.id)">{{ t('cookbooks.revokeInvite') }}</button>
              </li>
            }
          </ul>
        }
      } @else {
        <button type="button" class="danger" (click)="leave()">{{ t('cookbooks.leave') }}</button>
      }
      @if (error(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
    </section>
  `,
})
export class MembersPanelComponent {
  readonly book = input.required<Cookbook>();
  /** Members changed on the server (an author was removed): the page reloads the cookbook. */
  readonly changed = output<void>();
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);
  private readonly me = inject(AuthStore).me;
  protected readonly invites = signal<CookbookInvite[]>([]);
  protected readonly created = signal<CookbookInviteCreated | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const b = this.book();
      if (b.role !== 'OWNER' || this.loadedFor === b.id) return;
      this.loadedFor = b.id;
      untracked(() => void this.loadInvites(b.id));
    });
  }

  protected src = (p: Person): string | null => mediaUrl(p.avatarUrl);
  protected initial = (p: Person): string => [...(p.displayName || p.username)][0]?.toUpperCase() ?? '?';

  private async loadInvites(id: string): Promise<void> {
    try {
      this.invites.set(await this.api.invites(id));
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  protected async invite(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const c = await this.api.createInvite(this.book().id);
      this.created.set(c);
      this.invites.update((l) => [...l, { id: c.id, createdAt: new Date().toISOString(), expiresAt: c.expiresAt }]);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(inviteId: string): Promise<void> {
    this.error.set(null);
    try {
      await this.api.revokeInvite(this.book().id, inviteId);
      this.invites.update((l) => l.filter((i) => i.id !== inviteId));
      if (this.created()?.id === inviteId) this.created.set(null);
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  protected async remove(a: Person): Promise<void> {
    await this.removeAuthor(a.id as string, { name: a.displayName, self: false }, false);
  }

  protected async leave(): Promise<void> {
    const id = this.me()?.id;
    if (id) await this.removeAuthor(id, { name: this.book().name, self: true }, true);
  }

  private async removeAuthor(userId: string, data: { name: string; self: boolean }, leaving: boolean): Promise<void> {
    this.error.set(null);
    const res = await openSheet<{ removeRecipes: boolean } | false>(this.dialog, this.injector, RemoveMemberDialog, {
      label: this.i18n.translate(data.self ? 'cookbooks.leave' : 'cookbooks.removeMember'),
      data,
    });
    if (!res) return;
    try {
      await this.api.removeAuthor(this.book().id, userId, res.removeRecipes);
      if (leaving) await this.router.navigateByUrl('/cookbooks');
      else this.changed.emit();
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }
}
