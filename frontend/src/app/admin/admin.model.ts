export type AdminUser = { id: string; username: string; displayName: string; email: string; admin: boolean; createdAt: string };
export type PasswordReset = { url: string; expiresAt: string };
