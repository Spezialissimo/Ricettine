import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { TopBarComponent } from '../../shell/top-bar.component';
import { IconComponent } from '../../shared/icon.component';
import { openSheet } from '../../shared/sheet';
import { ShareRecipeDialog, ShareRecipeData } from '../../recipes/view/share-recipe.dialog';
import { CookbookHeroComponent } from '../cookbook-hero.component';
import {
  CookbookCard,
  CookbookRecipeCardsComponent,
  toCard,
} from '../cookbook-recipe-cards.component';
import { errorKey, toApiError } from '../../core/api-error';
import { LanguageService } from '../../core/language';
import { AuthStore } from '../../core/auth.store';
import { Site } from '../../core/site';
import { PageTitle } from '../../core/page-title';
import { mediaUrl } from '../../core/media';
import { CookbookApi } from '../cookbook.api';
import { PublicCookbook, peopleList, tokenFromShareUrl } from '../cookbook.model';

/**
 * The one view of a cookbook, at its share link /c/:token (owner, Plan 7: one address per content; the member
 * address /cookbooks/:id forwards here). Readable without an account. The banner, the description and the
 * recipe cards; Share for everyone (Reset link for the owner), Edit for members (/cookbooks/:id/edit).
 */
@Component({
  selector: 'app-cookbook-view-page',
  imports: [
    TopBarComponent,
    TranslocoDirective,
    RouterLink,
    IconComponent,
    CookbookHeroComponent,
    CookbookRecipeCardsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cookbook-view.page.scss',
  template: `
    <ng-container *transloco="let t">
      <app-top-bar [loginNext]="'/c/' + token" />
      <main>
        @if (notFound()) {
          <div class="state">
            <h1>{{ t('cookbooks.notFound') }}</h1>
            <p>{{ t('cookbooks.notFoundBody') }}</p>
            <a class="btn primary" routerLink="/">{{ t('cookbooks.home') }}</a>
          </div>
        } @else if (error(); as e) {
          <div class="state">
            <p class="alert" role="alert">{{ t(e) }}</p>
            <button type="button" class="btn primary" (click)="load()">
              {{ t('common.retry') }}
            </button>
          </div>
        } @else if (book(); as b) {
          <!-- the one view of a cookbook (owner, Plan 7: one address per content): readers, members and the
               owner all see it here; members also get Edit, the owner Reset link in Share -->
          <app-cookbook-hero
            [name]="b.name"
            [recipeCount]="b.recipes.length"
            [people]="people(b)"
            [coverUrl]="cover(b)"
          >
            <button type="button" class="icon-btn labelled" (click)="share(b)">
              <app-icon name="link" />
              {{ t('cookbooks.share') }}
            </button>
            @if (b.cookbookId && !site.demo()) {
              <a class="btn primary" [routerLink]="['/cookbooks', b.cookbookId, 'edit']">{{
                t('cookbooks.edit')
              }}</a>
            }
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
          <p class="loading" role="status">{{ t('common.loading') }}</p>
        }
      </main>
    </ng-container>
  `,
})
export class CookbookViewPage {
  private readonly api = inject(CookbookApi);
  private readonly title = inject(PageTitle);
  protected readonly auth = inject(AuthStore);
  protected readonly site = inject(Site);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  protected readonly book = signal<PublicCookbook | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    this.notFound.set(false);
    try {
      const b = await this.api.byToken(this.token);
      this.book.set(b);
      this.title.set(b.name);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 404) this.notFound.set(true);
      else this.error.set(errorKey(err));
    }
  }

  protected people(b: PublicCookbook): string {
    return peopleList(b.owner, b.authors, this.language.lang());
  }

  protected cards(b: PublicCookbook): CookbookCard[] {
    return b.recipes.map((r) => toCard(r, ['/c', this.token, 'r', r.recipeId]));
  }

  /** Share sheet for everyone; the owner also gets Reset link, which then moves this page to the new link. */
  protected share(b: PublicCookbook): void {
    const id = b.cookbookId;
    const data: ShareRecipeData = {
      url: `${location.origin}/c/${this.token}`,
      titleKey: 'cookbooks.shareSheetTitle',
      hintKey: 'cookbooks.shareHint',
      resetKey: 'cookbooks.resetLink',
      resetConfirmKey: 'cookbooks.resetLinkConfirm',
      resetDoneKey: 'cookbooks.linkReset',
      reset:
        b.viewerRole === 'OWNER' && id && !this.site.demo()
          ? async () => {
              const fresh = await this.api.resetLink(id);
              const tok = tokenFromShareUrl(fresh.shareUrl);
              if (tok) void this.router.navigateByUrl(`/c/${tok}`, { replaceUrl: true });
              return fresh.shareUrl!;
            }
          : undefined,
    };
    void openSheet(this.dialog, this.injector, ShareRecipeDialog, {
      label: this.i18n.translate('cookbooks.shareSheetTitle'),
      data,
    });
  }
  protected cover(b: PublicCookbook): string | null {
    return mediaUrl(b.cover?.displayUrl);
  }
}
