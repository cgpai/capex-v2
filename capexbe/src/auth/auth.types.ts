import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnterpriseRoleSlug } from './auth.constants';

export type { EnterpriseRoleSlug };

export type AuthSessionPayload = {
  sub: number;
  authId: string;
  sid: string;
  roles: EnterpriseRoleSlug[];
  iat?: number;
  exp?: number;
};

export type ResolvedAuthContext = {
  client: SupabaseClient;
  userId: number;
  authId: string;
  sessionId?: string;
  roles: EnterpriseRoleSlug[];
  accessToken: string;
  source: 'backend_jwt' | 'supabase_legacy';
};

export type AuthSessionMetaDto = {
  /** Access JWT expiry (epoch ms). */
  accessExpiresAt: number;
  /** Absolute session cap from first login (epoch ms). */
  absoluteExpiresAt: number;
  /** Server-side idle timeout (ms). */
  idleTimeoutMs: number;
};

export type AuthMeAssignmentDto = {
  roleName: string;
  assignedScopes: string[];
};

export type AuthMeDto = {
  id: number;
  username: string;
  email: string;
  roles: EnterpriseRoleSlug[];
  /** Role + scope untuk shell UI segera setelah /auth/me (tanpa tunggu full bootstrap). */
  assignments: AuthMeAssignmentDto[];
  idleTimeoutMs: number;
  session?: AuthSessionMetaDto;
};
