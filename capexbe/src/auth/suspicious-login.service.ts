import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

export type SuspiciousLoginResult = {
  suspicious: boolean;
  reasons: string[];
};

@Injectable()
export class SuspiciousLoginService {
  private adminClient(): SupabaseClient | null {
    const key = getSupabaseServiceKey();
    if (!key) return null;
    try {
      return createSupabaseClient(key);
    } catch {
      return null;
    }
  }

  /**
   * Compare current login metadata with recent successful logins.
   * Flags IP or user-agent changes within the last 30 days.
   */
  async evaluate(params: {
    userId: number;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SuspiciousLoginResult> {
    const client = this.adminClient();
    if (!client) return { suspicious: false, reasons: [] };

    const reasons: string[] = [];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recent } = await client
      .from('login_audit_logs')
      .select('ip_address, user_agent')
      .eq('user_id', params.userId)
      .eq('success', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!recent?.length) return { suspicious: false, reasons: [] };

    const knownIps = new Set(
      recent.map((r) => String(r.ip_address ?? '').trim()).filter(Boolean),
    );
    const knownAgents = new Set(
      recent.map((r) => String(r.user_agent ?? '').trim()).filter(Boolean),
    );

    const ip = params.ip?.trim() ?? '';
    const ua = params.userAgent?.trim() ?? '';

    if (ip && knownIps.size > 0 && !knownIps.has(ip)) {
      reasons.push('new_ip_address');
    }
    if (ua && knownAgents.size > 0 && !knownAgents.has(ua)) {
      reasons.push('new_user_agent');
    }

    return { suspicious: reasons.length > 0, reasons };
  }
}
