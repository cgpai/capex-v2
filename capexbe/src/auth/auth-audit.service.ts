import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

@Injectable()
export class AuthAuditService {
  private adminClient(): SupabaseClient | null {
    const key = getSupabaseServiceKey();
    if (!key) return null;
    try {
      return createSupabaseClient(key);
    } catch {
      return null;
    }
  }

  async logLogin(params: {
    userId?: number | null;
    authId?: string | null;
    email?: string | null;
    success: boolean;
    ip?: string | null;
    userAgent?: string | null;
    eventType?: string;
    isSuspicious?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (process.env.ENABLE_AUTH_AUDIT_LOG !== 'true') return;
    const client = this.adminClient();
    if (!client) return;
    try {
      const row: Record<string, unknown> = {
        user_id: params.userId ?? null,
        auth_id: params.authId ?? null,
        email: params.email ?? null,
        success: params.success,
        ip_address: params.ip ?? null,
        user_agent: params.userAgent ?? null,
      };
      if (params.eventType) row.event_type = params.eventType;
      if (params.isSuspicious != null) row.is_suspicious = params.isSuspicious;
      if (params.metadata) row.metadata = params.metadata;
      await client.from('login_audit_logs').insert(row);
    } catch {
      /* non-blocking */
    }
  }

  async logSessionEvent(params: {
    userId?: number | null;
    email?: string | null;
    success: boolean;
    ip?: string | null;
    userAgent?: string | null;
    eventType?: string;
  }): Promise<void> {
    await this.logLogin({ ...params, eventType: params.eventType ?? 'logout' });
  }
}
