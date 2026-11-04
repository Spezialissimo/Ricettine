import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PublicRecipe } from '../recipes/recipe.model';
import { Cookbook, CookbookEntry, CookbookInput, CookbookSummary, PublicCookbook, RecipeRef } from './cookbook.model';

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
}
