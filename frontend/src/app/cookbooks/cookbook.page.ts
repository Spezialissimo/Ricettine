import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorKey, toApiError } from '../core/api-error';
import { openEditorSheet } from '../recipes/editor/editor-sheet';
import { ConfirmDeleteCookbookDialog } from './confirm-delete-cookbook.dialog';
import { CookbookApi } from './cookbook.api';
import { Cookbook, CookbookInput, tokenFromShareUrl } from './cookbook.model';
import { CookbookSharePanelComponent } from './cookbook-share-panel.component';
import { MembersPanelComponent } from './members-panel.component';
import { mediaUrl } from '../core/media';
import { CookbookFormDialog } from './cookbook-form.dialog';
import { PhotoPickerComponent } from '../recipes/editor/photo-picker.component';

/** One cookbook: its recipes, and (owner only) Edit and Delete. Every member can remove entries. */
@Component({
  selector: 'app-cookbook-page',
  imports: [RouterLink, TranslocoDirective, CookbookSharePanelComponent, MembersPanelComponent, PhotoPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ng-container *transloco="let t">
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <a class="btn" routerLink="/cookbooks">{{ t('cookbooks.title') }}</a>
      } @else if (book(); as b) {
        <div class="head">
          <h1>{{ b.name }}</h1>
          @if (b.role === 'OWNER') {
            <div class="actions">
              <button type="button" class="btn" (click)="edit(b)">{{ t('cookbooks.edit') }}</button>
              <button type="button" class="btn danger" (click)="confirmDelete(b)">{{ t('cookbooks.delete') }}</button>
            </div>
          }
        </div>
        <div class="badges">
          <span class="badge" [attr.data-badge]="b.role">{{ t(b.role === 'OWNER' ? 'cookbooks.roleOwner' : 'cookbooks.roleAuthor') }}</span>
          <span class="badge" [attr.data-badge]="b.visibility">{{ t('cookbooks.visibility.' + b.visibility) }}</span>
        </div>
        @if (mediaUrl(b.cover?.displayUrl); as src) { <img class="cover" [src]="src" alt="" /> }
        @if (b.role === 'OWNER') {
          <div class="cover-actions">
            <app-photo-picker [label]="t(b.cover ? 'cookbooks.cover.replace' : 'cookbooks.cover.add')"
              [ariaLabel]="t(b.cover ? 'cookbooks.cover.replace' : 'cookbooks.cover.add')"
              (picked)="setCover(b, $event)" (rejected)="actionError.set($event)" />
            @if (b.cover) {
              <button type="button" class="btn" (click)="removeCover(b)">{{ t('cookbooks.cover.remove') }}</button>
            }
          </div>
        }
        @if (b.description) { <p class="desc">{{ b.description }}</p> }
        <app-cookbook-share-panel [book]="b" (updated)="book.set($event)" />
        <app-members-panel [book]="b" (changed)="load()" />
        @if (actionError(); as e) { <p class="alert" role="alert">{{ t(e) }}</p> }
        @if (b.recipes.length === 0) {
          <p class="empty">{{ t('cookbooks.noRecipes') }}</p>
        } @else {
          <ul class="entries">
            @for (r of b.recipes; track r.recipeId) {
              <li class="entry">
                @if (mediaUrl(r.coverThumbUrl); as src) { <img class="thumb" [src]="src" alt="" loading="lazy" /> }
                <div class="entry-body">
                  @if (token(b); as tok) {
                    <a class="entry-title" [routerLink]="['/c', tok, 'r', r.recipeId]">{{ r.title }}</a>
                  } @else {
                    <span class="entry-title">{{ r.title }}</span>
                  }
                  <span class="entry-meta">{{ t('recipes.by', { name: r.author?.displayName ?? t('cookbooks.deletedUser') }) }}</span>
                  <span class="entry-meta">{{ t('cookbooks.addedBy', { name: r.addedBy?.displayName ?? t('cookbooks.deletedUser') }) }}</span>
                </div>
                @if (r.mine) {
                  <a class="btn" [routerLink]="['/recipes', r.recipeId, 'edit']" [attr.aria-label]="t('cookbooks.editRecipe', { title: r.title })">{{ t('cookbooks.edit') }}</a>
                }
                <button type="button" class="btn" [attr.aria-label]="t('cookbooks.removeAria', { title: r.title })"
                  (click)="removeEntry(b, r.recipeId)">{{ t('cookbooks.remove') }}</button>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="loading" role="status">{{ t('cookbooks.loading') }}</p>
      }
    </ng-container>
  `,
})
export class CookbookPage {
  private readonly api = inject(CookbookApi);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly book = signal<Cookbook | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mediaUrl = mediaUrl;
  protected readonly token = (b: Cookbook) => tokenFromShareUrl(b.shareUrl);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.book.set(await this.api.get(this.id));
    } catch (e) {
      this.error.set(errorKey(toApiError(e)));
    }
  }

  protected async edit(b: Cookbook): Promise<void> {
    openEditorSheet(this.dialog, this.injector, CookbookFormDialog, {
      label: this.i18n.translate('cookbooks.editTitle'),
      data: {
        initial: { name: b.name, description: b.description, visibility: b.visibility },
        submit: async (input: CookbookInput) => this.book.set(await this.api.patch(b.id, { ...input, description: input.description ?? '' })),
      },
    });
  }

  protected async confirmDelete(b: Cookbook): Promise<void> {
    this.actionError.set(null);
    const ref = openEditorSheet(this.dialog, this.injector, ConfirmDeleteCookbookDialog, {
      label: this.i18n.translate('cookbooks.deleteConfirm.title'),
      data: { name: b.name },
    });
    if ((await firstValueFrom(ref.closed, { defaultValue: undefined })) !== true) return;
    try {
      await this.api.remove(b.id);
      await this.router.navigateByUrl('/cookbooks');
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    }
  }

  protected async setCover(b: Cookbook, file: File): Promise<void> {
    this.actionError.set(null);
    try {
      this.book.set(await this.api.setCover(b.id, file));
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    }
  }

  protected async removeCover(b: Cookbook): Promise<void> {
    this.actionError.set(null);
    try {
      this.book.set(await this.api.removeCover(b.id));
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    }
  }

  protected async removeEntry(b: Cookbook, recipeId: string): Promise<void> {
    this.actionError.set(null);
    try {
      await this.api.removeRecipe(b.id, recipeId);
      this.book.update((cur) => (cur ? { ...cur, recipes: cur.recipes.filter((r) => r.recipeId !== recipeId) } : cur));
    } catch (e) {
      this.actionError.set(errorKey(toApiError(e)));
    }
  }
}
