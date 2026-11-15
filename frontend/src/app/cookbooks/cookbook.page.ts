import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { errorKey, errorKeyOf, fieldErrorKey, toApiError } from '../core/api-error';
import { confirmSheet } from '../shared/confirm-dialog.component';
import { openSheet } from '../shared/sheet';
import { CookbookApi } from './cookbook.api';
import {
  Cookbook,
  CookbookVisibility,
  detailsErrors,
  peopleList,
  tokenFromShareUrl,
} from './cookbook.model';
import { CookbookHeroComponent } from './cookbook-hero.component';
import {
  CookbookCard,
  CookbookRecipeCardsComponent,
  toCard,
} from './cookbook-recipe-cards.component';
import { MembersPanelComponent } from './members-panel.component';
import { mediaUrl } from '../core/media';
import { PhotoPickerComponent } from '../recipes/editor/photo-picker.component';

/**
 * A member's cookbook. /cookbooks/:id forwards to the cookbook's one view, its share link /c/:token (owner,
 * Plan 7: one address per content). Edit (/cookbooks/:id/edit): name, description and visibility in place,
 * cover and Delete for the owner; members; every member can remove entries; Save returns to the view.
 */
@Component({
  selector: 'app-cookbook-page',
  imports: [
    RouterLink,
    CookbookHeroComponent,
    CookbookRecipeCardsComponent,
    TranslocoDirective,
    MembersPanelComponent,
    PhotoPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbooks.scss',
  template: `
    <ng-container *transloco="let t">
      @if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <a class="btn" routerLink="/kitchen/cookbooks">{{ t('cookbooks.title') }}</a>
      } @else if (book(); as b) {
        @if (!editing) {
          <!-- the view lives at the share link /c/:token (load() forwards there); this is only the fallback
               for a cookbook without a share link -->
          <app-cookbook-hero
            [name]="b.name"
            [recipeCount]="b.recipes.length"
            [people]="people(b)"
            [visibility]="b.visibility"
            [coverUrl]="mediaUrl(b.cover?.displayUrl)"
          >
            <a class="btn primary" [routerLink]="['/cookbooks', b.id, 'edit']">{{
              t('cookbooks.edit')
            }}</a>
          </app-cookbook-hero>
          @if (b.description) {
            <p class="book-desc">{{ b.description }}</p>
          }
          <h2 class="section-title">{{ t('cookbooks.recipesHeading') }}</h2>
          @if (b.recipes.length === 0) {
            <p class="empty">{{ t('cookbooks.noRecipes') }}</p>
          } @else {
            <app-cookbook-recipe-cards [cards]="cards(b)" />
          }
        } @else {
          <!-- edit: name, description and visibility in place (owner), cover, members, removing recipes,
               delete; Save stores the details and goes back to the view -->
          <div class="head">
            <h1>{{ t('titles.cookbookEdit') }}</h1>
            <div class="actions">
              @if (b.role === 'OWNER') {
                <button type="button" class="btn danger" (click)="confirmDelete(b)">
                  {{ t('cookbooks.delete') }}
                </button>
              }
              <button type="button" class="btn primary" [disabled]="busy()" (click)="save(b)">
                {{ t('cookbooks.save') }}
              </button>
            </div>
          </div>
          @if (b.role === 'OWNER') {
            <section class="details">
              <div class="field">
                <label for="cb-name">{{ t('cookbooks.name') }}</label>
                <input
                  id="cb-name"
                  type="text"
                  [value]="name()"
                  (input)="name.set($any($event.target).value)"
                  [attr.aria-invalid]="!!errors()['name']"
                  [attr.aria-describedby]="errors()['name'] ? 'cb-name-err' : null"
                />
                @if (errors()['name']; as code) {
                  <p class="field-error" id="cb-name-err">{{ t(fieldErrorKey(code)) }}</p>
                }
              </div>
              <div class="field">
                <label for="cb-desc">{{ t('cookbooks.description') }}</label>
                <textarea
                  id="cb-desc"
                  rows="3"
                  [value]="description()"
                  (input)="description.set($any($event.target).value)"
                  [attr.aria-invalid]="!!errors()['description']"
                  [attr.aria-describedby]="errors()['description'] ? 'cb-desc-err' : null"
                ></textarea>
                @if (errors()['description']; as code) {
                  <p class="field-error" id="cb-desc-err">{{ t(fieldErrorKey(code)) }}</p>
                }
              </div>
              <fieldset class="visibility">
                <legend>{{ t('cookbooks.visibilityLabel') }}</legend>
                @for (v of visibilities; track v) {
                  <label>
                    <input
                      type="radio"
                      name="cookbook-visibility"
                      [value]="v"
                      [checked]="visibility() === v"
                      (change)="visibility.set(v)"
                    />
                    {{ t('cookbooks.visibility.' + v) }}
                  </label>
                }
              </fieldset>
            </section>
          } @else {
            <p class="by">{{ b.name }}</p>
          }
          @if (mediaUrl(b.cover?.displayUrl); as src) {
            <img class="cover" [src]="src" alt="" />
          }
          @if (b.role === 'OWNER') {
            <div class="cover-actions">
              <app-photo-picker
                [label]="t(b.cover ? 'cookbooks.cover.replace' : 'cookbooks.cover.add')"
                [ariaLabel]="t(b.cover ? 'cookbooks.cover.replace' : 'cookbooks.cover.add')"
                (picked)="setCover(b, $event)"
                (rejected)="actionError.set($event)"
              />
              @if (b.cover) {
                <button type="button" class="btn" (click)="removeCover(b)">
                  {{ t('cookbooks.cover.remove') }}
                </button>
              }
            </div>
          }
          <app-members-panel [book]="b" (changed)="load()" />
          @if (actionError(); as e) {
            <p class="alert" role="alert">{{ t(e) }}</p>
          }
          @if (b.recipes.length === 0) {
            <p class="empty">{{ t('cookbooks.noRecipes') }}</p>
          } @else {
            <ul class="entries">
              @for (r of b.recipes; track r.recipeId) {
                <li class="entry">
                  @if (mediaUrl(r.coverThumbUrl); as src) {
                    <img class="thumb" [src]="src" alt="" loading="lazy" />
                  }
                  <div class="entry-body">
                    @if (token(b); as tok) {
                      <a class="entry-title" [routerLink]="['/c', tok, 'r', r.recipeId]">{{
                        r.title
                      }}</a>
                    } @else if (r.mine) {
                      <a class="entry-title" [routerLink]="['/recipes', r.recipeId, 'view']">{{
                        r.title
                      }}</a>
                    } @else {
                      <span class="entry-title">{{ r.title }}</span>
                    }
                    <span class="entry-meta">{{
                      t('recipes.by', { name: r.author?.displayName ?? t('cookbooks.deletedUser') })
                    }}</span>
                    <span class="entry-meta">{{
                      t('cookbooks.addedBy', {
                        name: r.addedBy?.displayName ?? t('cookbooks.deletedUser'),
                      })
                    }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn"
                    [attr.aria-label]="t('cookbooks.removeAria', { title: r.title })"
                    (click)="removeEntry(b, r.recipeId)"
                  >
                    {{ t('cookbooks.remove') }}
                  </button>
                </li>
              }
            </ul>
          }
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
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly id = this.route.paramMap.get('id') ?? '';
  /** The edit page (/cookbooks/:id/edit), else the view. */
  protected readonly editing = this.route.data?.['mode'] === 'edit';
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
      const b = await this.api.get(this.id);
      // one address per content (owner, Plan 7): the cookbook's view is its share link
      const tok = tokenFromShareUrl(b.shareUrl);
      if (!this.editing && tok) {
        await this.router.navigateByUrl(`/c/${tok}`, { replaceUrl: true });
        return;
      }
      this.book.set(b);
      // the details are filled once: a reload (after a member change) must not undo what the owner typed
      if (!this.detailsFilled) {
        this.detailsFilled = true;
        this.name.set(b.name);
        this.description.set(b.description ?? '');
        this.visibility.set(b.visibility);
      }
    } catch (e) {
      this.error.set(errorKeyOf(e));
    }
  }

  protected people(b: Cookbook): string {
    return peopleList(b.owner, b.authors, this.i18n.getActiveLang());
  }

  protected cards(b: Cookbook): CookbookCard[] {
    return b.recipes.map((r) => toCard(r, r.mine ? ['/recipes', r.recipeId, 'view'] : null));
  }

  // the edit page's details (owner): filled from the first load, stored by Save
  private detailsFilled = false;
  protected readonly visibilities: readonly CookbookVisibility[] = ['PRIVATE', 'PUBLIC'];
  protected readonly fieldErrorKey = fieldErrorKey;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly visibility = signal<CookbookVisibility>('PRIVATE');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  /** Save: the owner's details (when changed, validated like the server), then back to the view. */
  protected async save(b: Cookbook): Promise<void> {
    if (this.busy()) return;
    this.actionError.set(null);
    if (b.role === 'OWNER') {
      const name = this.name().trim();
      const description = this.description().trim();
      const errors = detailsErrors(name, description);
      this.errors.set(errors);
      if (Object.keys(errors).length > 0) return;
      const changed =
        name !== b.name ||
        description !== (b.description ?? '') ||
        this.visibility() !== b.visibility;
      if (changed) {
        this.busy.set(true);
        try {
          this.book.set(
            await this.api.patch(b.id, { name, description, visibility: this.visibility() }),
          );
        } catch (e) {
          const err = toApiError(e);
          if (err.code === 'validation_failed' && err.fields) this.errors.set(err.fields);
          else this.actionError.set(errorKey(err));
          return;
        } finally {
          this.busy.set(false);
        }
      }
    }
    await this.router.navigateByUrl(`/cookbooks/${b.id}`);
  }

  protected async confirmDelete(b: Cookbook): Promise<void> {
    this.actionError.set(null);
    const confirmed = await confirmSheet(this.dialog, this.injector, this.i18n, {
      titleKey: 'cookbooks.deleteConfirm.title',
      bodyKey: 'cookbooks.deleteConfirm.body',
      params: { name: b.name },
      confirmKey: 'cookbooks.deleteConfirm.confirm',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.api.remove(b.id);
      await this.router.navigateByUrl('/kitchen/cookbooks');
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    }
  }

  protected async setCover(b: Cookbook, file: File): Promise<void> {
    this.actionError.set(null);
    try {
      this.book.set(await this.api.setCover(b.id, file));
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    }
  }

  protected async removeCover(b: Cookbook): Promise<void> {
    this.actionError.set(null);
    try {
      this.book.set(await this.api.removeCover(b.id));
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    }
  }

  protected async removeEntry(b: Cookbook, recipeId: string): Promise<void> {
    this.actionError.set(null);
    try {
      await this.api.removeRecipe(b.id, recipeId);
      this.book.update((cur) =>
        cur ? { ...cur, recipes: cur.recipes.filter((r) => r.recipeId !== recipeId) } : cur,
      );
    } catch (e) {
      this.actionError.set(errorKeyOf(e));
    }
  }
}
