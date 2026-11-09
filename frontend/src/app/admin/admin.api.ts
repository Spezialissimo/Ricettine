import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Invite, InviteCreated } from '../shared/invite-list';
import { AdminUser, PasswordReset } from './admin.model';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  invites(): Promise<Invite[]> {
    return firstValueFrom(this.http.get<Invite[]>('/api/admin/invites'));
  }

  createInvite(): Promise<InviteCreated> {
    return firstValueFrom(this.http.post<InviteCreated>('/api/admin/invites', null));
  }

  revokeInvite(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/invites/${encodeURIComponent(id)}`));
  }

  users(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<AdminUser[]>('/api/admin/users'));
  }

  setAdmin(id: string, admin: boolean): Promise<AdminUser> {
    return firstValueFrom(
      this.http.post<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/admin`, { admin }),
    );
  }

  passwordReset(id: string): Promise<PasswordReset> {
    return firstValueFrom(
      this.http.post<PasswordReset>(
        `/api/admin/users/${encodeURIComponent(id)}/password-reset`,
        null,
      ),
    );
  }
}
