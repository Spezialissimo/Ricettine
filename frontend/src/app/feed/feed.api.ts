import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FeedResponse } from './feed.model';

const PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class FeedApi {
  private readonly http = inject(HttpClient);

  page(cursor?: string): Promise<FeedResponse> {
    let params = new HttpParams().set('limit', PAGE_SIZE);
    if (cursor) params = params.set('cursor', cursor);
    return firstValueFrom(this.http.get<FeedResponse>('/api/feed', { params }));
  }
}
