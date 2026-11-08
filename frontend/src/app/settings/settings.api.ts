import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Me } from '../core/auth.store';

/** The signed-in user's own account: profile, avatar, password, deletion. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  updateProfile(body: { displayName?: string; username?: string }): Promise<Me> {
    return firstValueFrom(this.http.patch<Me>('/api/me', body));
  }

  uploadAvatar(form: FormData): Promise<Me> {
    return firstValueFrom(this.http.put<Me>('/api/me/avatar', form));
  }

  removeAvatar(): Promise<Me> {
    return firstValueFrom(this.http.delete<Me>('/api/me/avatar'));
  }

  changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/me/password', body));
  }

  deleteAccount(password: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/me', { body: { password } }));
  }
}
