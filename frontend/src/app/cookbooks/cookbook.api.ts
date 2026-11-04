import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PublicRecipe } from '../recipes/recipe.model';
import {
  Cookbook, CookbookEntry, CookbookInput, CookbookInvite, CookbookInviteCreated, CookbookInvitePreview, CookbookSummary, PublicCookbook, RecipeRef,
} from './cookbook.model';

@Injectable({ providedIn: 'root' })
export class CookbookApi {
  private readonly http = inject(HttpClient);

  create(input: CookbookInput): Promise<Cookbook> {
    return firstValueFrom(this.http.post<Cookbook>('/api/cookbooks', input));
  }
  mine(): Promise<CookbookSummary[]> {
    return firstValueFrom(this.http.get<CookbookSummary[]>('/api/cookbooks/mine'));
  }
  get(id: string): Promise<Cookbook> {
    return firstValueFrom(this.http.get<Cookbook>(`/api/cookbooks/${encodeURIComponent(id)}`));
  }
  patch(id: string, input: Partial<CookbookInput>): Promise<Cookbook> {
    return firstValueFrom(this.http.patch<Cookbook>(`/api/cookbooks/${encodeURIComponent(id)}`, input));
  }
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${encodeURIComponent(id)}`));
  }
  /** `created` is true for a new entry (201), false when the recipe was already in the cookbook (200). */
  async addRecipe(id: string, ref: RecipeRef): Promise<{ entry: CookbookEntry; created: boolean }> {
    const res = await firstValueFrom(
      this.http.post<CookbookEntry>(`/api/cookbooks/${encodeURIComponent(id)}/recipes`, ref, { observe: 'response' }),
    );
    return { entry: res.body as CookbookEntry, created: res.status === 201 };
  }
  removeRecipe(id: string, recipeId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/cookbooks/${encodeURIComponent(id)}/recipes/${encodeURIComponent(recipeId)}`),
    );
  }
  setCover(id: string, file: File): Promise<Cookbook> {
    const body = new FormData();
    body.append('file', file);
    return firstValueFrom(this.http.put<Cookbook>(`/api/cookbooks/${encodeURIComponent(id)}/cover`, body));
  }
  removeCover(id: string): Promise<Cookbook> {
    return firstValueFrom(this.http.delete<Cookbook>(`/api/cookbooks/${encodeURIComponent(id)}/cover`));
  }
  resetLink(id: string): Promise<Cookbook> {
    return firstValueFrom(this.http.post<Cookbook>(`/api/cookbooks/${encodeURIComponent(id)}/share-link/reset`, {}));
  }
  byToken(token: string): Promise<PublicCookbook> {
    return firstValueFrom(this.http.get<PublicCookbook>(`/api/c/${encodeURIComponent(token)}`));
  }
  recipeByToken(token: string, recipeId: string): Promise<PublicRecipe> {
    return firstValueFrom(
      this.http.get<PublicRecipe>(`/api/c/${encodeURIComponent(token)}/recipes/${encodeURIComponent(recipeId)}`),
    );
  }
  createInvite(id: string): Promise<CookbookInviteCreated> {
    return firstValueFrom(this.http.post<CookbookInviteCreated>(`/api/cookbooks/${encodeURIComponent(id)}/invites`, {}));
  }
  invites(id: string): Promise<CookbookInvite[]> {
    return firstValueFrom(this.http.get<CookbookInvite[]>(`/api/cookbooks/${encodeURIComponent(id)}/invites`));
  }
  revokeInvite(id: string, inviteId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/cookbooks/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`),
    );
  }
  previewInvite(token: string): Promise<CookbookInvitePreview> {
    return firstValueFrom(this.http.get<CookbookInvitePreview>(`/api/cookbook-invites/${encodeURIComponent(token)}`));
  }
  acceptInvite(token: string): Promise<CookbookSummary> {
    return firstValueFrom(this.http.post<CookbookSummary>(`/api/cookbook-invites/${encodeURIComponent(token)}/accept`, {}));
  }
  /** The owner removes an author, or an author removes themselves (leave). */
  removeAuthor(id: string, userId: string, removeRecipes: boolean): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/cookbooks/${encodeURIComponent(id)}/authors/${encodeURIComponent(userId)}`, {
        params: { removeRecipes },
      }),
    );
  }
}
