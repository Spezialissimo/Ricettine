import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Photo, PublicRecipe, Recipe, RecipeInput, RecipeSummary } from './recipe.model';

@Injectable({ providedIn: 'root' })
export class RecipeApi {
  private readonly http = inject(HttpClient);

  create(): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>('/api/recipes', null));
  }
  get(id: string): Promise<Recipe> {
    return firstValueFrom(this.http.get<Recipe>(`/api/recipes/${encodeURIComponent(id)}`));
  }
  save(id: string, input: RecipeInput): Promise<Recipe> {
    return firstValueFrom(this.http.put<Recipe>(`/api/recipes/${encodeURIComponent(id)}`, input));
  }
  publish(id: string, version: number): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(`/api/recipes/${encodeURIComponent(id)}/publish`, { version }));
  }
  resetLink(id: string, version: number): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(`/api/recipes/${encodeURIComponent(id)}/share-link/reset`, { version }));
  }
  byToken(token: string): Promise<PublicRecipe> {
    return firstValueFrom(this.http.get<PublicRecipe>(`/api/r/${encodeURIComponent(token)}`));
  }
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/recipes/${encodeURIComponent(id)}`));
  }
  uploadPhoto(id: string, file: File): Promise<Photo> {
    const body = new FormData();
    body.append('file', file);
    return firstValueFrom(this.http.post<Photo>(`/api/recipes/${encodeURIComponent(id)}/photos`, body));
  }
  mine(): Promise<RecipeSummary[]> {
    return firstValueFrom(this.http.get<RecipeSummary[]>('/api/recipes/mine'));
  }
}
