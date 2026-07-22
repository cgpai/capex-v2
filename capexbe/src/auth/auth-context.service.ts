import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JwtTokenService } from './jwt-token.service';
import { SessionService } from './session.service';
import { AuthUserResolver } from './auth-user.resolver';
import { loadRoleSlugsForUser } from './load-roles.util';
import type { ResolvedAuthContext } from './auth.types';

/**
 * Central auth resolution: backend JWT or legacy Supabase access token.
 * Always binds app user id from identity — never trusts client userId alone.
 */
@Injectable()
export class AuthContextService {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly users: AuthUserResolver,
    private readonly sessions: SessionService,
  ) {}

  async resolve(
    accessToken: string,
    requestedUserId?: number,
  ): Promise<ResolvedAuthContext> {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    const token = accessToken.trim();

    if (this.looksLikeBackendJwt(token)) {
      return this.resolveBackendJwt(token, requestedUserId);
    }
    return this.resolveSupabaseLegacy(token, requestedUserId);
  }

  private looksLikeBackendJwt(token: string): boolean {
    try {
      const payload = this.jwt.verifyAccess(token);
      return Boolean(payload?.sid);
    } catch {
      return false;
    }
  }

  private async resolveBackendJwt(
    token: string,
    requestedUserId?: number,
  ): Promise<ResolvedAuthContext> {
    const payload = this.jwt.verifyAccess(token);
    if (payload.sid) {
      const active = await this.sessions.assertSessionActive(
        payload.sid,
        payload.sub,
      );
      if (!active) {
        throw new UnauthorizedException('Session revoked or expired');
      }
    }
    const userId = this.users.assertUserIdMatch(payload.sub, requestedUserId);
    const client = this.users.createAnonClient();
    const roles = await loadRoleSlugsForUser(client, userId);
    const { error: rlsError } = await client.rpc('set_current_user_id', {
      user_id_param: userId,
    });
    if (rlsError) {
      throw new BadRequestException(
        `RLS session failed: ${rlsError.message || 'set_current_user_id rejected'}`,
      );
    }
    return {
      client,
      userId,
      authId: payload.authId,
      sessionId: payload.sid,
      roles,
      accessToken: token,
      source: 'backend_jwt',
    };
  }

  private async resolveSupabaseLegacy(
    token: string,
    requestedUserId?: number,
  ): Promise<ResolvedAuthContext> {
    const client = this.users.createAnonClient(token);
    const { data: authData, error: authErr } = await client.auth.getUser(token);
    if (authErr || !authData?.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    const appUser = await this.users.resolveAppUserByAuthId(
      client,
      authData.user.id,
      authData.user.email,
    );
    const userId = this.users.assertUserIdMatch(appUser.id, requestedUserId);
    const { error: rlsError } = await client.rpc('set_current_user_id', {
      user_id_param: userId,
    });
    if (rlsError) {
      throw new BadRequestException(
        `RLS session failed: ${rlsError.message || 'set_current_user_id rejected'}`,
      );
    }
    return {
      client,
      userId,
      authId: authData.user.id,
      roles: appUser.roles,
      accessToken: token,
      source: 'supabase_legacy',
    };
  }

  async getRlsClient(
    accessToken: string,
    requestedUserId?: number,
  ): Promise<{ client: SupabaseClient; userId: number }> {
    const ctx = await this.resolve(accessToken, requestedUserId);
    return { client: ctx.client, userId: ctx.userId };
  }

  /**
   * Service-role client for server-side reads after auth is verified.
   * RBAC/scope is enforced in capexbe — not via legacy PostgreSQL scope RLS policies.
   */
  createServiceClient(): SupabaseClient {
    return this.users.createAnonClient();
  }
}
