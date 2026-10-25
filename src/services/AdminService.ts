import type { Role } from '../core/types';
import type { ApiClient } from './ApiClient';

export interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: Role;
  expires_at: string | null;
  deactivated_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
}

export interface NewUserDraft {
  email: string;
  password: string;
  display_name?: string;
  role: Role;
  expires_at?: string | null;
}

export type JobName = 'expire_guests' | 'purge_messages' | 'post_celebrations' | 'run_coffee_round';
export type ExportFormat = 'json' | 'csv';

/** Beheerfuncties die via de Python-backend lopen, omdat ze de geheime service-sleutel nodig hebben. */
export class AdminService {
  constructor(private readonly api: ApiClient) {}

  listUsers(): Promise<AdminUser[]> {
    return this.api.get<AdminUser[]>('/admin/users');
  }

  createUser(draft: NewUserDraft): Promise<AdminUser> {
    return this.api.post<AdminUser>('/admin/users', draft);
  }

  inviteUser(email: string, role?: Role): Promise<AdminUser> {
    return this.api.post<AdminUser>('/admin/users/invite', { email, role });
  }

  deactivate(userId: string): Promise<AdminUser> {
    return this.api.post<AdminUser>(`/admin/users/${userId}/deactivate`);
  }

  reactivate(userId: string): Promise<AdminUser> {
    return this.api.post<AdminUser>(`/admin/users/${userId}/reactivate`);
  }

  setPassword(userId: string, password: string): Promise<void> {
    return this.api.post<void>(`/admin/users/${userId}/password`, { password });
  }

  setRole(userId: string, role: Role, expiresAt?: string | null): Promise<AdminUser> {
    return this.api.put<AdminUser>(`/admin/users/${userId}/role`, { role, expires_at: expiresAt ?? null });
  }

  async getRetentionDays(): Promise<number> {
    return (await this.api.get<{ days: number }>('/admin/settings/retention')).days;
  }

  async setRetentionDays(days: number): Promise<number> {
    return (await this.api.put<{ days: number }>('/admin/settings/retention', { days })).days;
  }

  exportMessages(channelId: string | null, since: string | null, format: ExportFormat) {
    return this.api.download('/admin/export', { channel_id: channelId, since, format });
  }

  runJob(name: JobName): Promise<Record<string, unknown>> {
    return this.api.post<Record<string, unknown>>(`/jobs/${name}`);
  }
}

/** Maakt een sterk willekeurig wachtwoord van 16 tekens zonder verwarrende tekens. */
export function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}
