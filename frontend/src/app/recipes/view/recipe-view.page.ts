import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { CookbookApi } from '../../cookbooks/cookbook.api';
import { AddToCookbookDialog } from '../../cookbooks/add-to-cookbook.dialog';
import { openEditorSheet } from '../editor/editor-sheet';
import { AuthStore } from '../../core/auth.store';
import { errorKey, toApiError } from '../../core/api-error';
import { mediaUrl } from '../../core/media';
import { formatAmount } from '../amount';
import { durationKey } from '../editor/time-sheet.component';
import { RecipeApi } from '../recipe.api';
import { PublicRecipe } from '../recipe.model';

/** Only web links become links; any other source text is shown as plain text. */
export const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * The read-only recipe page at /r/:token: readable without an account, with its own minimal header.
 * Desktop: ingredients in a sticky column beside the steps; phone: stacked.
 */
@Component({
  selector: 'app-recipe-view-page',
  imports: [TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './recipe-view.page.scss',
  template: `
    <ng-container *transloco="let t">
      <header class="topbar">
        <div class="bar">
          <a class="logo" routerLink="/">{{ t('common.appName') }}</a>
          <span class="spacer"></span>
          @if (auth.me()) {
            <a class="btn" routerLink="/recipes">{{ t('nav.recipes') }}</a>
          } @else {
            <a class="btn primary" routerLink="/login" [queryParams]="{ next: loginNext }">{{ t('auth.login') }}</a>
          }
        </div>
      </header>
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
            <button type="button" class="btn primary" (click)="load()">{{ t('common.retry') }}</button>
          </div>
        } @else if (recipe(); as r) {
          @if (viaCookbook) {
            <a class="back" [routerLink]="['/c', token]">{{ cookbookName() ? t('cookbooks.backTo', { name: cookbookName() }) : t('cookbooks.back') }}</a>
          }
          @if (cover(r); as src) {
            <!-- decorative here: the title is the h1 right below; the cover is the page's main image (LCP) -->
            <img class="cover" [src]="src" alt="" loading="eager" fetchpriority="high" />
          }
          <div class="author">
            @if (avatar(r); as a) {
              <img class="avatar" [src]="a" alt="" />
            } @else {
              <span class="avatar" aria-hidden="true"></span>
            }
            <span>{{ t('recipes.by', { name: r.author.displayName }) }}</span>
            @if (r.viewerIsAuthor && r.recipeId) {
              <a class="btn" [routerLink]="['/recipes', r.recipeId, 'edit']">{{ t('recipes.edit') }}</a>
            }
            @if (auth.me() && !viaCookbook) {
              <button type="button" class="btn" (click)="addToCookbook()">{{ t('cookbooks.addToCookbook') }}</button>
            }
          </div>
          <h1>{{ r.title }}</h1>
          <ul class="chips" role="list">
            <li class="chip"><span aria-hidden="true">🍽</span> {{ t('editor.chips.serves', { n: r.portions }) }}</li>
            @if (r.prepMinutes !== null) {
              @let p = duration(r.prepMinutes);
              <li class="chip"><span aria-hidden="true">⏱</span> {{ t('editor.chips.prep', { time: t(p.key, p.params) }) }}</li>
            }
            @if (r.cookMinutes !== null) {
              @let c = duration(r.cookMinutes);
              <li class="chip"><span aria-hidden="true">🔥</span> {{ t('editor.chips.cook', { time: t(c.key, c.params) }) }}</li>
            }
            @if (r.source) {
              @if (isWeb(r.source)) {
                <li><a class="chip" [href]="r.source" rel="noopener noreferrer" target="_blank"><span aria-hidden="true">🔗</span> {{ r.source }}</a></li>
              } @else {
                <li class="chip"><span aria-hidden="true">🔗</span> {{ r.source }}</li>
              }
            }
          </ul>
          <div class="rp">
            <!-- tabindex: on desktop this is a scroll box, which keyboard users must be able to scroll -->
            <section class="ingredients" aria-labelledby="ing-h" tabindex="0">
              <h2 id="ing-h">{{ t('editor.ingredients') }}</h2>
              @for (g of r.groups; track $index) {
                @if (g.name) { <h3 class="grp">{{ g.name }}</h3> }
                <ul class="ingr-list" role="list">
                  @for (i of g.ingredients; track $index) {
                    <li>
                      @if (i.amount !== null) { <b>{{ amount(i.amount) }}{{ i.unit ? ' ' + t('units.' + i.unit) : '' }}</b> }
                      {{ i.name }}@if (i.note) { <span class="note">, {{ i.note }}</span> }
                    </li>
                  }
                </ul>
              }
            </section>
            <section aria-labelledby="steps-h">
              <h2 id="steps-h">{{ t('editor.steps') }}</h2>
              <ol class="steps" role="list">
                @for (s of r.steps; track $index) {
                  <li>
                    <span class="num" aria-hidden="true">{{ $index + 1 }}</span>
                    <div class="step-body">
                      <p>{{ s.text }}</p>
                      @if (stepPhoto(s.photo); as src) {
                        <img class="step-photo" [src]="src" [alt]="t('recipes.stepAlt', { n: $index + 1 })" loading="lazy" />
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
  private readonly title = inject(Title);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);
  private readonly snapshot = inject(ActivatedRoute).snapshot;
  /** Opened through a cookbook link (/c/:token/r/:recipeId) instead of the recipe's own link. */
  protected readonly viaCookbook = this.snapshot.data?.['via'] === 'cookbook';
  protected readonly token = this.snapshot.paramMap.get('token') ?? '';
  private readonly recipeId = this.snapshot.paramMap.get('recipeId') ?? '';
  protected readonly loginNext = this.viaCookbook ? `/c/${this.token}/r/${this.recipeId}` : `/r/${this.token}`;
  protected readonly cookbookName = signal<string | null>(null);
  protected readonly recipe = signal<PublicRecipe | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duration = durationKey;
  protected readonly isWeb = isWebUrl;
  protected readonly amount = formatAmount;

  constructor() {
    const previous = this.title.getTitle();
    inject(DestroyRef).onDestroy(() => this.title.setTitle(previous));
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    this.notFound.set(false);
    try {
      if (this.viaCookbook) {
        // the name only labels the Back link: never let its failure hide the recipe
        void this.cookbooks.byToken(this.token).then((b) => this.cookbookName.set(b.name), () => undefined);
      }
      const r = this.viaCookbook ? await this.cookbooks.recipeByToken(this.token, this.recipeId) : await this.api.byToken(this.token);
      this.recipe.set(r);
      if (r.title) this.title.setTitle(r.title);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 404) this.notFound.set(true);
      else this.error.set(errorKey(err));
    }
  }

  protected addToCookbook(): void {
    openEditorSheet(this.dialog, this.injector, AddToCookbookDialog, {
      label: this.i18n.translate('cookbooks.addToCookbook'),
      data: { ref: { shareToken: this.token } },
    });
  }

  protected cover(r: PublicRecipe): string | null {
    return mediaUrl(r.cover?.displayUrl);
  }
  protected stepPhoto(p: { displayUrl: string } | null): string | null {
    return mediaUrl(p?.displayUrl);
  }
  protected avatar(r: PublicRecipe): string | null {
    return mediaUrl(r.author.avatarUrl);
  }
}
