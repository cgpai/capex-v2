import type { User } from '../../types';
import { clearTabSessionState } from './clearTabSessionState';
import { updateSessionMeta } from './sessionMetaStore';
import { clearSupabaseSessionAfterExchange } from './signInForExchange';
import { mergeAuthIdentityUser, type AuthMeAssignment } from './mergeAuthIdentityUser';

type ExchangeUser = {
  id: number;
  username: string;
  email: string;
  roles?: string[];
  assignments?: AuthMeAssignment[];
  idleTimeoutMs?: number;
  session?: {
    accessExpiresAt: number;
    absoluteExpiresAt: number;
    idleTimeoutMs: number;
  };
};

function toAppUser(data: ExchangeUser): User {
  return mergeAuthIdentityUser(
    { id: data.id, username: data.username, email: data.email },
    {
      meAssignments: data.assignments,
      roleSlugs: data.roles,
    },
  );
}

/** Exchange Supabase OAuth access token for backend httpOnly session. */
export async function exchangeOAuthForBackendSession(supabaseAccessToken: string): Promise<User | null> {
  try {
    const res = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseAccessToken}` },
      credentials: 'include',
    });
    if (!res.ok) {
      let message =
        'Login Microsoft gagal. Pastikan akun Anda terdaftar di Capex Pro dan coba lagi.';
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const raw = body?.message;
        const detail = Array.isArray(raw) ? raw.join(', ') : raw;
        if (detail?.trim()) message = detail.trim();
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('auth_oauth_error', message);
      }
      await clearSupabaseSessionAfterExchange();
      return null;
    }
    const data = (await res.json()) as ExchangeUser;
    if (!data?.id) return null;

    if (data.session) updateSessionMeta(data.session);
    clearTabSessionState();
    await clearSupabaseSessionAfterExchange();
    return toAppUser(data);
  } catch {
    await clearSupabaseSessionAfterExchange();
    return null;
  }
}
