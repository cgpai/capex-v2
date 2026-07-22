import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JwtTokenService } from './jwt-token.service';
import {
  ABSOLUTE_SESSION_MS,
  IDLE_TIMEOUT_SENSITIVE_MS,
  IDLE_TIMEOUT_STANDARD_MS,
  SENSITIVE_ROLE_SLUGS,
} from './auth.constants';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

export type StoredSession = {
  id: string;
  userId: number;
  authId: string;
  familyId: string;
  lastActiveAt?: Date;
  familyStartedAt?: Date;
};

@Injectable()
export class SessionService {
  private adminClient(): SupabaseClient {
    const key = getSupabaseServiceKey();
    if (!key) {
      throw new UnauthorizedException('Database not configured');
    }
    return createSupabaseClient(key);
  }

  async createSession(params: {
    userId: number;
    authId: string;
    refreshRaw: string;
    refreshHash: string;
    expiresAt: Date;
    familyId?: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<StoredSession> {
    const id = randomUUID();
    const familyId = params.familyId ?? randomUUID();
    const client = this.adminClient();
    const { error } = await client.from('auth_sessions').insert({
      id,
      user_id: params.userId,
      auth_id: params.authId,
      refresh_token_hash: params.refreshHash,
      family_id: familyId,
      expires_at: params.expiresAt.toISOString(),
      ip_address: params.ip ?? null,
      user_agent: params.userAgent ?? null,
      last_active_at: new Date().toISOString(),
    });
    if (error) {
      throw new UnauthorizedException('Could not create session');
    }
    return { id, userId: params.userId, authId: params.authId, familyId };
  }

  async findValidSession(refreshRaw: string): Promise<StoredSession & { refreshHash: string }> {
    const hash = JwtTokenService.hashToken(refreshRaw);
    const client = this.adminClient();
    const { data, error } = await client
      .from('auth_sessions')
      .select('id, user_id, auth_id, family_id, expires_at, revoked_at, last_active_at, created_at')
      .eq('refresh_token_hash', hash)
      .maybeSingle();
    if (error || !data) {
      throw new UnauthorizedException('Invalid session');
    }
    if (data.revoked_at) {
      await this.revokeFamily(data.family_id as string);
      throw new UnauthorizedException('Session revoked');
    }
    const expiresAt = new Date(String(data.expires_at));
    if (expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    if (familyStartedAt.getTime() + ABSOLUTE_SESSION_MS < Date.now()) {
      await this.revokeFamily(String(data.family_id));
      throw new UnauthorizedException('Absolute session expired');
    }

    return {
      id: String(data.id),
      userId: Number(data.user_id),
      authId: String(data.auth_id),
      familyId: String(data.family_id),
      refreshHash: hash,
      lastActiveAt: data.last_active_at ? new Date(String(data.last_active_at)) : undefined,
      familyStartedAt,
    };
  }

  async rotateSession(
    session: StoredSession,
    oldRefreshRaw: string,
    newRefreshRaw: string,
    newRefreshHash: string,
    newExpiresAt: Date,
  ): Promise<StoredSession> {
    const client = this.adminClient();
    const oldHash = JwtTokenService.hashToken(oldRefreshRaw);
    const { data: current } = await client
      .from('auth_sessions')
      .select('refresh_token_hash')
      .eq('id', session.id)
      .maybeSingle();
    if (!current || current.refresh_token_hash !== oldHash) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const familyStartedAt =
      session.familyStartedAt ?? (await this.getFamilyStartedAt(session.familyId));
    const absoluteCap = familyStartedAt.getTime() + ABSOLUTE_SESSION_MS;
    const cappedExpiresAt = new Date(
      Math.min(newExpiresAt.getTime(), absoluteCap),
    );
    if (cappedExpiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException('Absolute session expired');
    }

    const now = new Date().toISOString();
    await client
      .from('auth_sessions')
      .update({ revoked_at: now })
      .eq('id', session.id);
    return this.createSession({
      userId: session.userId,
      authId: session.authId,
      refreshRaw: newRefreshRaw,
      refreshHash: newRefreshHash,
      expiresAt: cappedExpiresAt,
      familyId: session.familyId,
    });
  }

  async touchSession(sessionId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('revoked_at', null);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const client = this.adminClient();
    await client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .is('revoked_at', null);
  }

  async assertSessionActive(sessionId: string, userId: number): Promise<boolean> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('id, last_active_at, revoked_at, family_id, created_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data || data.revoked_at) return false;

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    if (familyStartedAt.getTime() + ABSOLUTE_SESSION_MS < Date.now()) {
      await this.revokeFamily(String(data.family_id));
      return false;
    }
    return true;
  }

  idleTimeoutMsForRoles(roles: string[]): number {
    const sensitive = roles.some((r) => SENSITIVE_ROLE_SLUGS.has(r));
    return sensitive ? IDLE_TIMEOUT_SENSITIVE_MS : IDLE_TIMEOUT_STANDARD_MS;
  }

  /** Reject if server-side idle timeout exceeded (sliding session). */
  assertNotIdle(lastActiveAt: Date | undefined, idleTimeoutMs: number): void {
    if (!lastActiveAt) return;
    if (Date.now() - lastActiveAt.getTime() > idleTimeoutMs) {
      throw new UnauthorizedException('Session idle timeout');
    }
  }

  async getSessionMeta(
    sessionId: string,
    userId: number,
    roles: string[],
    accessExpiresAt: number,
  ): Promise<{
    accessExpiresAt: number;
    absoluteExpiresAt: number;
    idleTimeoutMs: number;
  } | null> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('family_id, last_active_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (!data) return null;

    const familyStartedAt = await this.getFamilyStartedAt(String(data.family_id));
    return {
      accessExpiresAt,
      absoluteExpiresAt: familyStartedAt.getTime() + ABSOLUTE_SESSION_MS,
      idleTimeoutMs: this.idleTimeoutMsForRoles(roles),
    };
  }

  private async getFamilyStartedAt(familyId: string): Promise<Date> {
    const client = this.adminClient();
    const { data } = await client
      .from('auth_sessions')
      .select('created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.created_at) {
      return new Date(String(data.created_at));
    }
    return new Date();
  }
}
