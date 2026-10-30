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

export type JobName = 'expire_guests' | 'purge_messages' | 'post_celebrations' | 'run_coffee_round';
export type ExportFormat = 'json' | 'csv';

/** Beheerfuncties via de Python-backend, die de geheime service-sleutel nodig heeft. Accounts aanpassen zit hier bewust niet bij. */
export class AdminService {
  constructor(private readonly api: ApiClient) {}

  listUsers(): Promise<AdminUser[]> {
    return this.api.get<AdminUser[]>('/admin/users');
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
