import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Profile } from './profile.model';

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly http = inject(HttpClient);

  get(username: string): Promise<Profile> {
    return firstValueFrom(
      this.http.get<Profile>(`/api/users/${encodeURIComponent(username)}/profile`),
    );
  }
}
