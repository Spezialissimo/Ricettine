import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Recipe, RecipeInput, RecipeSummary } from './recipe.model';

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
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/recipes/${encodeURIComponent(id)}`));
  }
  mine(): Promise<RecipeSummary[]> {
    return firstValueFrom(this.http.get<RecipeSummary[]>('/api/recipes/mine'));
  }
}
