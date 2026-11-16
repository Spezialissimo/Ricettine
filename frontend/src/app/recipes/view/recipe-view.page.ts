import { TopBarComponent } from '../../shell/top-bar.component';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuItemCheckbox, CdkMenuTrigger } from '@angular/cdk/menu';
import { ScreenWakeLock } from './screen-wake-lock';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { CookbookApi } from '../../cookbooks/cookbook.api';
import { AddToCookbookDialog } from '../../cookbooks/add-to-cookbook.dialog';
import { openSheet } from '../../shared/sheet';
import { AuthStore } from '../../core/auth.store';
import { Site } from '../../core/site';
import { LanguageService } from '../../core/language';
import { PageTitle } from '../../core/page-title';
import { errorKey, toApiError } from '../../core/api-error';
import { mediaUrl } from '../../core/media';
import { AvatarComponent } from '../../shared/avatar.component';
import { scaleAmount, shownAmount } from '../amount';
import { unitKey } from '../units';
import { durationKey } from '../editor/time-sheet.component';
import { RecipeApi } from '../recipe.api';
import { Ingredient, PublicRecipe, Recipe } from '../recipe.model';
import { KeepScreenOnComponent } from './keep-screen-on.component';
import { IconComponent } from '../../shared/icon.component';
import { ShareRecipeDialog, ShareRecipeData } from './share-recipe.dialog';
import { PortionsStepperComponent } from './portions-stepper.component';

/** Only web links become links; any other source text is shown as plain text. */
const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * The read-only recipe page at /r/:token: readable without an account, with its own minimal header.
 * Desktop: ingredients in a sticky column beside the steps; phone: stacked.
 */
@Component({
  selector: 'app-recipe-view-page',
  imports: [
    AvatarComponent,
    TopBarComponent,
    TranslocoDirective,
    RouterLink,
    PortionsStepperComponent,
    KeepScreenOnComponent,
    IconComponent,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkMenuItemCheckbox,
  ],
  providers: [ScreenWakeLock],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipe-view.page.scss',
  host: { '[class.previewing]': 'preview || (own && !ownPublished())' },
  template: `
    <ng-container *transloco="let t">
      <app-top-bar [loginNext]="loginNext" />
      @if (own && !ownPublished() && recipe()) {
        <!-- the author's draft: say so, and offer to publish it from here -->
        <div class="preview-banner draft">
          <p role="status">{{ t('recipes.draftBanner') }}</p>
          <button type="button" class="btn primary" [disabled]="publishing()" (click)="publish()">
            {{ t('recipes.publish') }}
          </button>
          @if (publishError(); as e) {
            <p class="alert" role="alert">{{ t(e) }}</p>
          }
        </div>
      }
      @if (preview) {
        <div class="preview-banner">
          <p role="status">{{ t('editor.previewBanner') }}</p>
          <a class="btn primary" [routerLink]="['/recipes', previewId, 'edit']">{{
            t('editor.backToEditor')
          }}</a>
        </div>
      }
      <main>
        @if (notFound()) {
          <div class="state">
            <h1>{{ t('recipes.notFound') }}</h1>
            <p>{{ t('recipes.notFoundBody') }}</p>
            @if (viaCookbook) {
              <a class="btn" [routerLink]="['/c', token]">{{ t('cookbooks.back') }}</a>
            }
            <a class="btn primary" routerLink="/">{{ t('recipes.home') }}</a>
          </div>
        } @else if (error(); as e) {
          <div class="state">
            <p class="alert" role="alert">{{ t(e) }}</p>
            <button type="button" class="btn primary" (click)="load()">
              {{ t('common.retry') }}
            </button>
          </div>
        } @else if (recipe(); as r) {
          <!-- desktop (owner sketch): a header card with the title, details and author left, the actions and the
               photo right; below it the ingredients (sticky) beside the steps. Phone: title, details, author,
               actions, photo, ingredients, steps. -->
          <section class="recipe-head" aria-labelledby="recipe-title">
            @let url = shareUrl(r);
            @let canAdd =
              !siteInfo.demo() &&
              !!auth.me() &&
              !viaCookbook &&
              !preview &&
              (!own || ownPublished());
            @let canEdit = r.viewerIsAuthor && !!r.recipeId;
            <!-- phone: the photo with the title over its bottom edge and a ⋯ menu in its corner (owner sketch);
                 desktop: the wrapper dissolves into the card's grid -->
            <div class="hero" [class.has-cover]="!!cover(r)">
              @if (cover(r); as src) {
                <!-- decorative: the title is the h1 over it; the cover is the page's main image (LCP) -->
                <img class="cover" [src]="src" alt="" loading="eager" fetchpriority="high" />
              }
              <!-- phone with a photo: the title and the details over its bottom edge, on a dark fade -->
              <div class="overlay">
                <h1 id="recipe-title">{{ r.title }}</h1>
                <div class="meta">
                  <ul class="chips" role="list">
                    @if (r.prepMinutes !== null) {
                      @let p = duration(r.prepMinutes);
                      <li class="chip">
                        <span aria-hidden="true">⏱</span>
                        {{ t('editor.chips.prep', { time: t(p.key, p.params) }) }}
                      </li>
                    }
                    @if (r.cookMinutes !== null) {
                      @let c = duration(r.cookMinutes);
                      <li class="chip">
                        <span aria-hidden="true">🔥</span>
                        {{ t('editor.chips.cook', { time: t(c.key, c.params) }) }}
                      </li>
                    }
                  </ul>
                  <!-- not a pill: a long link wrapped badly in one (owner, Plan 7); a web link shows its site only -->
                  @if (r.source) {
                    <p class="source">
                      {{ t('recipes.source') }}
                      @if (isWeb(r.source)) {
                        <a
                          [href]="r.source"
                          rel="noopener noreferrer"
                          target="_blank"
                          [title]="r.source"
                          >{{ site(r.source) }} <span aria-hidden="true">↗</span
                          ><span class="visually-hidden"> {{ t('recipes.opensInNewTab') }}</span></a
                        >
                      } @else {
                        <span>{{ r.source }}</span>
                      }
                    </p>
                  }
                  <div class="author">
                    <app-avatar
                      [name]="r.author.displayName"
                      [avatarUrl]="r.author.avatarUrl"
                      [size]="32"
                    />
                    @if (auth.me()) {
                      <a class="by" [routerLink]="['/u', r.author.username]">{{
                        t('recipes.by', { name: r.author.displayName })
                      }}</a>
                    } @else {
                      <span>{{ t('recipes.by', { name: r.author.displayName }) }}</span>
                    }
                  </div>
                </div>
              </div>
              @if (url || canAdd || canEdit || wake.supported) {
                <button
                  type="button"
                  class="icon-btn more"
                  [attr.aria-label]="t('recipes.more')"
                  [attr.title]="t('recipes.more')"
                  [cdkMenuTriggerFor]="moreMenu"
                >
                  <app-icon name="more" />
                </button>
                <ng-template #moreMenu>
                  <div class="menu" cdkMenu>
                    @if (canAdd) {
                      <button
                        type="button"
                        class="menu-item"
                        cdkMenuItem
                        (cdkMenuItemTriggered)="addToCookbook()"
                      >
                        {{ t('cookbooks.addToCookbook') }}
                      </button>
                    }
                    @if (canEdit) {
                      <a
                        class="menu-item"
                        cdkMenuItem
                        [routerLink]="['/recipes', r.recipeId, 'edit']"
                        >{{ t('recipes.edit') }}</a
                      >
                    }
                    @if (url) {
                      <button
                        type="button"
                        class="menu-item"
                        cdkMenuItem
                        (cdkMenuItemTriggered)="share(r, url)"
                      >
                        {{ t('recipes.share') }}
                      </button>
                    }
                    @if (wake.supported) {
                      <!-- phone: Keep screen on lives in this menu (desktop: the checkbox in the card) -->
                      <button
                        type="button"
                        class="menu-item check"
                        cdkMenuItemCheckbox
                        [cdkMenuItemChecked]="wake.on()"
                        (cdkMenuItemTriggered)="wake.toggle(!wake.on())"
                      >
                        {{ t('recipes.keepScreenOn') }}
                        <span class="tick" aria-hidden="true">{{ wake.on() ? '✓' : '' }}</span>
                      </button>
                    }
                  </div>
                </ng-template>
              }
            </div>
            <div class="actions">
              @if (url) {
                <button type="button" class="icon-btn labelled share" (click)="share(r, url)">
                  <app-icon name="link" />
                  {{ t('recipes.share') }}
                </button>
              }
              @if (canAdd) {
                <button type="button" class="btn" (click)="addToCookbook()">
                  {{ t('cookbooks.addToCookbook') }}
                </button>
              }
              @if (canEdit) {
                <a class="btn primary" [routerLink]="['/recipes', r.recipeId, 'edit']">{{
                  t('recipes.edit')
                }}</a>
              }
            </div>
            <app-keep-screen-on class="keep" />
          </section>
          <div class="layout">
            <!-- tabindex: on desktop this is a scroll box, which keyboard users must be able to scroll -->
            <section class="ingredients" aria-labelledby="ing-h" tabindex="0">
              <h2 id="ing-h">{{ t('editor.ingredients') }}</h2>
              <div class="ing-card">
                <!-- the servings pill heads the list, centred -->
                <div class="serves">
                  <app-portions-stepper
                    [value]="chosen() ?? r.portions"
                    [written]="r.portions"
                    (valueChange)="chosen.set($event)"
                  />
                </div>
                @for (g of r.groups; track $index) {
                  @if (g.name) {
                    <h3 class="grp">{{ g.name }}</h3>
                  }
                  <ul class="ingr-list" role="list">
                    @for (i of g.ingredients; track $index) {
                      <li>
                        @if (i.amount !== null) {
                          <b
                            >{{ amount(i, r.portions)
                            }}{{ i.unit ? ' ' + t(unit(i, r.portions)) : '' }}</b
                          >
                        }
                        <!-- the comma belongs to the name, so no space can come before it -->
                        {{ i.note ? i.name + ',' : i.name }}
                        @if (i.note) {
                          <span class="note">{{ i.note }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            </section>
            <section class="steps-section" aria-labelledby="steps-h">
              <h2 id="steps-h">{{ t('editor.steps') }}</h2>
              <ol class="steps" role="list">
                @for (s of shownSteps(r); track $index) {
                  <li>
                    <span class="num" aria-hidden="true">{{ $index + 1 }}</span>
                    <div class="step-body">
                      <p>{{ s.text }}</p>
                      @if (stepPhoto(s.photo); as src) {
                        <img
                          class="step-photo"
                          [src]="src"
                          [alt]="t('recipes.stepAlt', { n: $index + 1 })"
                          loading="lazy"
                        />
                      }
                    </div>
                  </li>
                }
              </ol>
              @if (r.notes) {
                <div class="notes">
                  <h2>{{ t('editor.notes') }}</h2>
                  <p>{{ r.notes }}</p>
                </div>
              }
            </section>
          </div>
        } @else {
          <p class="loading" role="status">{{ t('common.loading') }}</p>
        }
      </main>
    </ng-container>
  `,
})
export class RecipeViewPage {
  private readonly api = inject(RecipeApi);
  private readonly cookbooks = inject(CookbookApi);
  private readonly title = inject(PageTitle);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly auth = inject(AuthStore);
  protected readonly siteInfo = inject(Site);
  protected readonly wake = inject(ScreenWakeLock);
  private readonly snapshot = inject(ActivatedRoute).snapshot;
  /** Opened through a cookbook link (/c/:token/r/:recipeId) instead of the recipe's own link. */
  protected readonly viaCookbook = this.snapshot.data?.['via'] === 'cookbook';
  /** The author's preview of their own recipe (/recipes/:id/preview), draft or published, from the editor. */
  protected readonly preview = this.snapshot.data?.['via'] === 'preview';
  /** The author's own recipe from My kitchen (/recipes/:id/view): like the preview, without its banner. */
  protected readonly own = this.snapshot.data?.['via'] === 'own';
  /** Own or preview: loaded through the owner API by id. */
  private readonly byId = this.preview || this.own;
  /** Own / preview: published (Add to cookbook needs it; a draft shows the draft banner). */
  protected readonly ownPublished = signal(false);
  protected readonly publishing = signal(false);
  protected readonly publishError = signal<string | null>(null);
  protected readonly previewId = this.snapshot.paramMap.get('id') ?? '';
  /**
   * Own / preview: the version shown. Publish and Reset link write at it, so a change saved meanwhile (the
   * editor in another tab) is a conflict, not published unseen.
   */
  private shownVersion: number | null = null;
  /** In the preview: the recipe's share link once it is published (a draft has none). */
  private readonly previewShare = signal<string | null>(null);
  private readonly router = inject(Router);
  protected readonly token = this.snapshot.paramMap.get('token') ?? '';
  private readonly recipeId = this.snapshot.paramMap.get('recipeId') ?? '';
  protected readonly loginNext = this.viaCookbook
    ? `/c/${this.token}/r/${this.recipeId}`
    : `/r/${this.token}`;
  protected readonly recipe = signal<PublicRecipe | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duration = durationKey;
  protected readonly isWeb = isWebUrl;
  /** The portions picked with the stepper; null = as written. */
  protected readonly chosen = signal<number | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    this.notFound.set(false);
    try {
      const r = this.byId
        ? await this.ownAsReader()
        : this.viaCookbook
          ? await this.cookbooks.recipeByToken(this.token, this.recipeId)
          : await this.api.byToken(this.token);
      this.chosen.set(null);
      this.recipe.set(r);
      if (r.title) this.title.set(r.title);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 404) this.notFound.set(true);
      else this.error.set(errorKey(err));
    }
  }

  /** The saved recipe as readers will get it, with the signed-in author as its author. */
  private async ownAsReader(): Promise<PublicRecipe> {
    const own = await this.api.get(this.previewId);
    this.shownVersion = own.version;
    this.previewShare.set(own.shareUrl);
    this.ownPublished.set(own.status === 'PUBLISHED');
    // one address per content (owner, Plan 7): a published recipe's view is its share link
    if (this.own && own.status === 'PUBLISHED' && own.shareUrl) {
      void this.router.navigateByUrl(new URL(own.shareUrl).pathname, { replaceUrl: true });
    }
    const me = this.auth.me();
    return {
      title: own.title,
      author: {
        username: me?.username ?? '',
        displayName: me?.displayName ?? '',
        avatarUrl: me?.avatarUrl ?? null,
      },
      portions: own.portions,
      prepMinutes: own.prepMinutes,
      cookMinutes: own.cookMinutes,
      source: own.source,
      notes: own.notes,
      cover: own.cover,
      groups: own.groups,
      steps: own.steps,
      publishedAt: own.publishedAt ?? own.updatedAt,
      viewerIsAuthor: this.own, // the preview has "Back to editor" instead of Edit
      recipeId: own.id,
    };
  }

  /** Publish the draft from its page; then the page moves to the recipe's share link. */
  protected async publish(): Promise<void> {
    if (this.publishing()) return;
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      const published = await this.api.publish(this.previewId, this.shownVersion ?? 0);
      this.shownVersion = published.version;
      this.ownPublished.set(true);
      if (published.shareUrl) {
        await this.router.navigateByUrl(new URL(published.shareUrl).pathname, { replaceUrl: true });
      }
    } catch (e) {
      const err = toApiError(e);
      this.publishError.set(
        err.code === 'recipe_incomplete' ? 'recipes.publishIncomplete' : errorKey(err),
      );
      if (err.status === 409) void this.load(); // show what was saved meanwhile; Publish then publishes that
    } finally {
      this.publishing.set(false);
    }
  }

  protected amount(i: Pick<Ingredient, 'amount' | 'unit'>, written: number): string {
    return this.shown(i, written)?.text ?? '';
  }

  /** The unit's i18n key, singular or plural to match the amount shown next to it. */
  protected unit(i: Pick<Ingredient, 'amount' | 'unit'>, written: number): string {
    return i.unit
      ? unitKey(i.unit, this.shown(i, written)?.value ?? null, this.language.lang())
      : '';
  }

  private shown(i: Pick<Ingredient, 'amount' | 'unit'>, written: number) {
    const chosen = this.chosen() ?? written;
    return shownAmount(scaleAmount(i.amount, written, chosen), i.unit, {
      scaled: chosen !== written,
      locale: this.language.lang(),
    });
  }

  /**
   * The link to share: this page's own address (the recipe link, or the cookbook's recipe link), or in the
   * preview the recipe's share link once published. Null for a draft preview: nothing to share yet.
   */
  protected shareUrl(r: PublicRecipe): string | null {
    if (this.byId) return this.previewShare();
    return this.viaCookbook ? location.href : `${location.origin}/r/${this.token}`;
  }

  /** Share sheet for every reader; the author also gets Reset link (not through a cookbook link). */
  protected share(r: PublicRecipe, url: string): void {
    const id = r.recipeId;
    const canReset =
      !this.siteInfo.demo() && (r.viewerIsAuthor || this.preview) && !!id && !this.viaCookbook;
    const data: ShareRecipeData = {
      url,
      reset: canReset ? () => this.resetLink(id!) : undefined,
    };
    void openSheet(this.dialog, this.injector, ShareRecipeDialog, {
      label: this.i18n.translate('recipes.shareTitle'),
      data,
    });
  }

  /**
   * Resets the share link; on the old link's page, moves to the new one. Own / preview write at the version
   * shown (a conflict reloads the page); a reader's page has no version, so it asks for the latest first.
   */
  private async resetLink(id: string): Promise<string> {
    let fresh: Recipe;
    try {
      fresh = await this.api.resetLink(
        id,
        this.byId && this.shownVersion !== null
          ? this.shownVersion
          : (await this.api.get(id)).version,
      );
    } catch (e) {
      if (this.byId && toApiError(e).status === 409) void this.load();
      throw e;
    }
    if (this.byId) this.shownVersion = fresh.version;
    const url = fresh.shareUrl!;
    if (this.byId) this.previewShare.set(url);
    else void this.router.navigateByUrl(new URL(url).pathname, { replaceUrl: true });
    return url;
  }

  protected addToCookbook(): void {
    void openSheet(this.dialog, this.injector, AddToCookbookDialog, {
      label: this.i18n.translate('cookbooks.addToCookbook'),
      data: { ref: this.own ? { recipeId: this.previewId } : { shareToken: this.token } },
    });
  }

  /** "ricette.giallozafferano.it" for "https://ricette.giallozafferano.it/Pasta.html" (the full link is the href). */
  protected site(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /** Steps with neither text nor a photo are left out, so the numbering has no gaps. */
  protected shownSteps(r: PublicRecipe): PublicRecipe['steps'] {
    return r.steps.filter((s) => s.text?.trim() || s.photo);
  }

  protected cover(r: PublicRecipe): string | null {
    return mediaUrl(r.cover?.displayUrl);
  }
  protected stepPhoto(p: { displayUrl: string } | null): string | null {
    return mediaUrl(p?.displayUrl);
  }
}
