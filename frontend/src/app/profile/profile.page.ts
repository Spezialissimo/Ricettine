import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { errorKey, toApiError } from '../core/api-error';
import { mediaUrl } from '../core/media';
import { PageTitle } from '../core/page-title';
import { ProfileApi } from './profile.api';
import { Profile, ProfileRecipe } from './profile.model';

@Component({
  selector: 'app-user-profile-page',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../recipes/recipes.scss', './profile.page.scss'],
  template: `
    <ng-container *transloco="let t">
      @if (notFound()) {
        <h1>{{ t('profile.notFound') }}</h1>
        <p class="empty">{{ t('profile.notFoundBody') }}</p>
        <a class="primary" routerLink="/">{{ t('recipes.home') }}</a>
      } @else if (error(); as e) {
        <p class="alert" role="alert">{{ t(e) }}</p>
        <button type="button" class="retry" (click)="load()">{{ t('common.retry') }}</button>
      } @else if (profile(); as p) {
        <div class="head">
          @if (avatar(p); as a) {
            <img class="avatar" [src]="a" alt="" />
          } @else {
            <span class="avatar" aria-hidden="true"></span>
          }
          <div>
            <h1>{{ p.person.displayName }}</h1>
            <p class="handle">&#64;{{ p.person.username }}</p>
          </div>
        </div>
        <section aria-labelledby="prof-recipes">
          <h2 id="prof-recipes">{{ t('profile.recipes') }}</h2>
          @if (p.recipes.length === 0) {
            <p class="empty">{{ p.self ? t('recipes.empty') : t('profile.noRecipes') }}</p>
          } @else {
            <ul class="grid">
              @for (r of p.recipes; track r.id) {
                <li>
                  <a class="recipe" [routerLink]="recipeLink(r)">
                    @if (thumb(r.coverThumbUrl); as src) {
                      <img class="thumb" [src]="src" [alt]="t('recipes.coverAlt', { title: r.title || t('recipes.untitled') })" />
                    } @else {
                      <span class="thumb none" aria-hidden="true"></span>
                    }
                    <span class="body">
                      <span class="name" [class.untitled]="!r.title">{{ r.title || t('recipes.untitled') }}</span>
                      @if (p.self) {
                        <span class="badge" [attr.data-badge]="badge(r)">{{ t('recipes.status.' + badge(r)) }}</span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>
        @if (p.cookbooks.length > 0) {
          <section aria-labelledby="prof-books">
            <h2 id="prof-books">{{ t('profile.cookbooks') }}</h2>
            <ul class="grid">
              @for (b of p.cookbooks; track b.id) {
                <li>
                  <a class="recipe" [routerLink]="p.self ? ['/cookbooks', b.id] : ['/c', b.shareToken]">
                    @if (thumb(b.coverThumbUrl); as src) {
                      <img class="thumb" [src]="src" [alt]="t('recipes.coverAlt', { title: b.name })" />
                    } @else {
                      <span class="thumb none" aria-hidden="true"></span>
                    }
                    <span class="body">
                      <span class="name">{{ b.name }}</span>
                      <span class="meta">{{
                        t(b.recipeCount === 1 ? 'cookbooks.recipeCountOne' : 'cookbooks.recipeCountOther', { count: b.recipeCount })
                      }}</span>
                      @if (p.self) {
                        <span class="badge" [attr.data-badge]="b.visibility.toLowerCase()">{{ t('cookbooks.visibility.' + b.visibility) }}</span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      } @else {
        <p class="loading" role="status">{{ t('profile.loading') }}</p>
      }
    </ng-container>
  `,
})
export class UserProfilePage {
  private readonly api = inject(ProfileApi);
  private readonly title = inject(PageTitle);
  private readonly username = inject(ActivatedRoute).snapshot.paramMap.get('username') ?? '';
  protected readonly profile = signal<Profile | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    this.notFound.set(false);
    try {
      const p = await this.api.get(this.username);
      this.profile.set(p);
      this.title.set(p.person.displayName);
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 404) this.notFound.set(true);
      else this.error.set(errorKey(err));
    }
  }

  protected avatar(p: Profile): string | null {
    return mediaUrl(p.person.avatarUrl);
  }

  protected thumb(url: string | null): string | null {
    return mediaUrl(url);
  }

  protected recipeLink(r: ProfileRecipe): string[] {
    return r.status === 'DRAFT' || !r.shareToken ? ['/recipes', r.id, 'edit'] : ['/r', r.shareToken];
  }

  protected badge(r: ProfileRecipe): 'draft' | 'private' | 'public' {
    if (r.status === 'DRAFT') return 'draft';
    return r.visibility === 'PUBLIC' ? 'public' : 'private';
  }
}
