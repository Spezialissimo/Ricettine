import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Me } from '../core/auth.store';
import { AccountValues } from '../auth/account-form.component';

/** Sign-up style calls made while signed out: first admin, invite registration, password reset. */
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);

  setup(v: AccountValues): Promise<Me> {
    return firstValueFrom(this.http.post<Me>('/api/setup/admin', { ...v, email: v.email.trim() }));
  }

  /** Rejects with a 404 when the invite is gone. */
  checkInvite(token: string): Promise<unknown> {
    return firstValueFrom(this.http.get(`/api/invites/${encodeURIComponent(token)}`));
  }

  register(token: string, v: AccountValues): Promise<Me> {
    return firstValueFrom(this.http.post<Me>(`/api/invites/${encodeURIComponent(token)}/register`, { ...v, email: v.email.trim() }));
  }

  resetPassword(token: string, newPassword: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/password-resets/${encodeURIComponent(token)}`, { newPassword }));
  }
}
