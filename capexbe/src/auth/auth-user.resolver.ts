import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { roleNameToSlug, type EnterpriseRoleSlug } from './auth.constants';
import {
  createSupabaseClient,
  getSupabaseAnonKey,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { escapeIlikePattern } from '../shared/postgrest-filter.util';

export type AppUserRow = {
  id: number;
  username: string;
  email: string;
  auth_id: string | null;
};

export type ResolvedAppUser = AppUserRow & {
  roles: EnterpriseRoleSlug[];
  assignments: { roleName: string; assignedScopes: string[] }[];
};

@Injectable()
export class AuthUserResolver {
  private readonly logger = new Logger(AuthUserResolver.name);
  /**
   * Supabase client for server reads/writes after set_current_user_id.
   * Uses anon key + user JWT when possible so Postgres RLS applies on scoped tables.
   */
  createAnonClient(accessToken?: string): SupabaseClient {
    const serviceKey = getSupabaseServiceKey();
    const anonKey = getSupabaseAnonKey();
    const key = accessToken ? anonKey || serviceKey : serviceKey || anonKey;
    if (!key) {
      throw new UnauthorizedException('Supabase not configured');
    }
    if (serviceKey && key === serviceKey && process.env.NODE_ENV === 'production') {
      console.warn(
        '[auth] SUPABASE_SERVICE_ROLE_KEY in use — ensure RLS policies are not "Allow all access" on sensitive tables.',
      );
    }
    return createSupabaseClient(key, { accessToken });
  }

  async resolveAppUserByAuthId(
    client: SupabaseClient,
    authId: string,
    email?: string | null,
  ): Promise<ResolvedAppUser> {
    let lastReason: string | null = null;
    const { data: byAuth, error: authErr } = await client
      .from('users')
      .select('id, username, email, auth_id')
      .eq('auth_id', authId)
      .maybeSingle();
    if (authErr) lastReason = `lookup-by-auth_id failed: ${authErr.message || 'unknown'}`;

    let row = byAuth as AppUserRow | null;
    if (!row && email) {
      const { data: rows } = await client
        .from('users')
        .select('id, username, email, auth_id')
        .ilike('email', escapeIlikePattern(email.trim()));
      if (!rows?.length) lastReason = lastReason ?? 'lookup-by-email returned 0 rows';
      const lower = email.trim().toLowerCase();
      row =
        (rows as AppUserRow[] | null)?.find(
          (r) => (r.email ?? '').toLowerCase() === lower,
        ) ?? null;
    }

    // First login can come from Supabase Auth user that is already present in public.users
    // but not linked yet (`auth_id` is null). Link it lazily by email.
    if (
      row?.id &&
      (!row.auth_id ||
        String(row.auth_id).trim() === '' ||
        String(row.auth_id).trim() !== authId)
    ) {
      const { data: linkedRow } = await client
        .from('users')
        .update({ auth_id: authId })
        .eq('id', row.id)
        .select('id, username, email, auth_id')
        .maybeSingle();
      if (linkedRow) {
        row = linkedRow as AppUserRow;
      }
    }

    // If RLS blocked the first lookup, retry with service-role client when available.
    if (!row?.id) {
      const serviceKey = getSupabaseServiceKey();
      if (serviceKey) {
        const svc = this.createAnonClient();
        const { data: byAuthSvc, error: byAuthSvcErr } = await svc
          .from('users')
          .select('id, username, email, auth_id')
          .eq('auth_id', authId)
          .maybeSingle();
        if (byAuthSvcErr) lastReason = `service lookup-by-auth_id failed: ${byAuthSvcErr.message || 'unknown'}`;
        row = byAuthSvc as AppUserRow | null;

        if (!row && email) {
          const { data: rowsSvc, error: rowsSvcErr } = await svc
            .from('users')
            .select('id, username, email, auth_id')
            .ilike('email', escapeIlikePattern(email.trim()));
          if (rowsSvcErr) lastReason = `service lookup-by-email failed: ${rowsSvcErr.message || 'unknown'}`;
          if (!rowsSvc?.length) lastReason = lastReason ?? 'service lookup-by-email returned 0 rows';
          const lower = email.trim().toLowerCase();
          row =
            (rowsSvc as AppUserRow[] | null)?.find(
              (r) => (r.email ?? '').toLowerCase() === lower,
            ) ?? null;
          if (
            row?.id &&
            (!row.auth_id ||
              String(row.auth_id).trim() === '' ||
              String(row.auth_id).trim() !== authId)
          ) {
            const { data: linkedSvc } = await svc
              .from('users')
              .update({ auth_id: authId })
              .eq('id', row.id)
              .select('id, username, email, auth_id')
              .maybeSingle();
            if (linkedSvc) row = linkedSvc as AppUserRow;
          }
        }
      }
    }

    // `authErr` from the first attempt can happen under RLS; if a later fallback
    // resolves the user successfully, do not fail the exchange flow.
    if (!row?.id) {
      this.logger.error(
        `resolveAppUserByAuthId failed authId=${authId} email=${email ?? 'n/a'} reason=${lastReason ?? 'no match'}`,
      );
      throw new UnauthorizedException('User not registered in application');
    }

    const assignments = await this.loadAssignments(client, row.id);
    const roles = [
      ...new Set(assignments.map((a) => roleNameToSlug(a.roleName))),
    ] as EnterpriseRoleSlug[];

    return {
      ...row,
      id: Number(row.id),
      roles,
      assignments,
    };
  }

  private async loadAssignments(
    client: SupabaseClient,
    userId: number,
  ): Promise<{ roleName: string; assignedScopes: string[] }[]> {
    const { data } = await client
      .from('user_assignments')
      .select('id, roles(*)')
      .eq('user_id', userId);
    const assignmentRows = data ?? [];
    const assignmentIds = assignmentRows
      .map((row) => Number((row as { id?: number }).id))
      .filter((id) => Number.isFinite(id));

    let scopeRows: { user_assignment_id?: number; scope_type?: string; scope_id?: string }[] = [];
    if (assignmentIds.length) {
      const { data: scopes } = await client
        .from('user_assignment_scopes')
        .select('user_assignment_id, scope_type, scope_id')
        .in('user_assignment_id', assignmentIds);
      scopeRows = scopes ?? [];
    }

    const out: { roleName: string; assignedScopes: string[] }[] = [];
    for (const row of assignmentRows) {
      const aid = Number((row as { id?: number }).id);
      const roles = (
        row as {
          roles?: { role_name?: string; name?: string } | { role_name?: string; name?: string }[];
        }
      ).roles;
      const roleObj = Array.isArray(roles) ? roles[0] : roles;
      const roleName = roleObj?.role_name ?? roleObj?.name;
      if (!roleName) continue;
      const assignedScopes = [
        ...new Set(
          scopeRows
            .filter((s) => Number(s.user_assignment_id) === aid)
            .map((s) => {
              const scopeType = String(s.scope_type ?? '').trim();
              if (scopeType === 'All') return 'All';
              return String(s.scope_id ?? '').trim();
            })
            .filter((x) => x !== ''),
        ),
      ];
      out.push({ roleName: String(roleName), assignedScopes });
    }
    return out;
  }

  assertUserIdMatch(resolvedUserId: number, requestedUserId?: number): number {
    const uid = Number(resolvedUserId);
    if (!Number.isFinite(uid)) {
      throw new UnauthorizedException('Invalid user context');
    }
    if (requestedUserId == null || !Number.isFinite(Number(requestedUserId))) {
      return uid;
    }
    if (Number(requestedUserId) !== uid) {
      throw new UnauthorizedException('User context mismatch');
    }
    return uid;
  }
}
