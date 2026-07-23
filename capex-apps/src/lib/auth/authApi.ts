import type { User } from '../../types';
import { useBackendSession } from './authConstants';
import { coordinatedRefreshSession } from './authRefreshCoordinator';
import { authenticatedFetch } from './authenticatedFetch';
import { clearClientCsrfCookie, getCsrfToken, withCsrfHeaders } from './csrfToken';
import { hasSessionCookieHint, setSessionCookieHint } from './sessionCookieHint';
import { clearTabSessionState } from './clearTabSessionState';
import { updateSessionMeta, clearSessionMeta } from './sessionMetaStore';
import { clearSupabaseSessionAfterExchange } from './signInForExchange';
import { readCachedAuthUser } from '../authSessionCache';
import { mergeAuthIdentityUser } from './mergeAuthIdentityUser';

export type AuthSessionMeta = {
  accessExpiresAt: number;
  absoluteExpiresAt: number;
  idleTimeoutMs: number;
};

export type AuthMeAssignment = {
  roleName: string;
  assignedScopes?: string[];
};

export type AuthMeResponse = {
  authenticated: boolean;
  user?: {
    id: number;
    username: string;
    email: string;
    roles: string[];
    assignments?: AuthMeAssignment[];
    idleTimeoutMs: number;
    session?: AuthSessionMeta;
  };
  session?: AuthSessionMeta;
};

let meInFlight: Promise<AuthMeResponse | null> | null = null;

const PROBE_CACHE_MS = 4_000;
let lastProbeAt = 0;
let lastProbeResult: AuthMeResponse | null = null;
let probeInFlight: Promise<AuthMeResponse | null> | null = null;

function hasLocalSessionHint(): boolean {
  if (typeof window === 'undefined') return false;
  return hasSessionCookieHint();
}

function clearStaleClientSessionHints(): void {
  setSessionCookieHint(false);
  clearClientCsrfCookie();
}

export { setSessionCookieHint } from './sessionCookieHint';
export function invalidateStaleAuthCookies(): void {
  clearStaleClientSessionHints();
}

/** Best-effort: wipe httpOnly session cookies via BFF (no backend refresh — avoids login race). */
export async function clearServerAuthCookies(): Promise<void> {
  if (!useBackendSession() || typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/clear-cookies', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* noop */
  }
  clearStaleClientSessionHints();
}

/** Clear cached probe result (logout / forced unauthenticated). */
export function invalidateAuthProbeCache(): void {
  lastProbeAt = 0;
  lastProbeResult = null;
  probeInFlight = null;
  meInFlight = null;
}

/**
 * Single deduped session probe for app startup.
 * Skips refresh when no local session hint (clean login page → one /me, no data).
 */
export async function probeBackendSession(options?: {
  force?: boolean;
}): Promise<AuthMeResponse | null> {
  if (!useBackendSession()) return { authenticated: false };

  const now = Date.now();
  if (!options?.force && probeInFlight) return probeInFlight;
  if (
    !options?.force &&
    lastProbeResult &&
    now - lastProbeAt < PROBE_CACHE_MS
  ) {
    return lastProbeResult;
  }

  probeInFlight = (async () => {
    const hadSessionHint = hasLocalSessionHint();
    let me = await fetchAuthMe();
    if (!me?.authenticated && hadSessionHint && hasSessionCookieHint()) {
      const refreshOk = await refreshBackendSessionCoordinated();
      if (refreshOk) me = await fetchAuthMe();
      else {
        clearStaleClientSessionHints();
        void clearServerAuthCookies();
      }
    }
    lastProbeAt = Date.now();
    lastProbeResult = me ?? { authenticated: false };
    return lastProbeResult;
  })().finally(() => {
    probeInFlight = null;
  });

  return probeInFlight;
}

/** True when startup should call /api/auth/me (session cookies or OAuth in progress). */
export function shouldRunAuthSessionProbe(options: {
  hasSessionCookies?: boolean;
  oauthCallback?: boolean;
}): boolean {
  if (!useBackendSession()) return false;
  if (options.oauthCallback) return true;
  if (options.hasSessionCookies) return true;
  return false;
}

function backendBase(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
}

function errorFromAuthResponse(
  status: number,
  body: { message?: string | string[]; error?: string },
): string {
  const msg = Array.isArray(body.message)
    ? body.message.join(', ')
    : body.message;
  if (msg) return msg;
  if (status === 429) {
    return 'Terlalu banyak percobaan login. Tunggu ±15 menit lalu coba lagi.';
  }
  if (status === 503) {
    return 'Backend tidak berjalan. Jalankan capexbe di port 3001 (npm run start:dev).';
  }
  if (status === 404) {
    return 'Endpoint auth tidak ditemukan. Pastikan capexbe berjalan di port 3001.';
  }
  if (status >= 500) {
    return 'Server error. Pastikan capexbe berjalan dan coba lagi.';
  }
  return 'Could not establish session';
}

/** BFF or direct backend — always credentials for cookies. */
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const useBff = typeof window !== 'undefined';
  const url = useBff ? `/api/auth${path}` : `${backendBase()}/auth${path}`;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const noRetryPaths = new Set(['/login', '/exchange', '/refresh', '/me', '/forgot-password']);
  const mergedInit = withCsrfHeaders({ ...init, headers });
  return authenticatedFetch(url, {
    ...mergedInit,
    credentials: 'include',
    retryOn401: useBackendSession() && !noRetryPaths.has(path),
  });
}

function meUserToAppUser(
  data: NonNullable<AuthMeResponse['user']>,
): User {
  return mergeAuthIdentityUser(
    { id: data.id, username: data.username, email: data.email },
    {
      meAssignments: data.assignments,
      roleSlugs: data.roles,
    },
  );
}

async function loginWithServerPassword(
  email: string,
  password: string,
): Promise<{ user: User | null; roles: string[]; error: string | null }> {
  try {
    const res = await authFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return {
        user: null,
        roles: [],
        error: errorFromAuthResponse(res.status, body),
      };
    }
    const data = (await res.json()) as AuthMeResponse['user'] & { session?: AuthSessionMeta };
    if (!data?.id) {
      return { user: null, roles: [], error: 'Login failed' };
    }
    if (data.session) updateSessionMeta(data.session);
    clearTabSessionState();
    setSessionCookieHint(true);
    return {
      user: meUserToAppUser(data),
      roles: Array.isArray(data.roles) ? data.roles : [],
      error: null,
    };
  } catch {
    return { user: null, roles: [], error: 'Network error ke backend login' };
  }
}

/** Login always goes through backend session endpoint. */
export async function loginWithBackend(
  email: string,
  password: string,
): Promise<{ user: User | null; roles: string[]; error: string | null }> {
  if (!useBackendSession()) {
    return { user: null, roles: [], error: 'Backend session disabled' };
  }
  return loginWithServerPassword(email, password);
}

/** Request password reset email via backend (Supabase Auth). */
export async function requestPasswordResetBackend(
  email: string,
  redirectTo?: string,
): Promise<{ error: string | null }> {
  if (!useBackendSession()) {
    return { error: 'Backend session disabled' };
  }
  try {
    const res = await authFetch('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, redirectTo }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return { error: errorFromAuthResponse(res.status, body) };
    }
    return { error: null };
  } catch {
    return { error: 'Network error ke backend forgot-password' };
  }
}

/** Change password for authenticated user (verifies current password server-side). */
export async function changePasswordBackend(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  if (!useBackendSession()) {
    return { error: 'Backend session disabled' };
  }
  try {
    const res = await authFetch('/change-password', {
      method: 'POST',
      body: JSON.stringify({ userId, currentPassword, newPassword }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      return { error: errorFromAuthResponse(res.status, body) };
    }
    return { error: null };
  } catch {
    return { error: 'Network error ke backend change-password' };
  }
}

export async function fetchAuthMe(): Promise<AuthMeResponse | null> {
  if (!useBackendSession()) return null;
  if (meInFlight) return meInFlight;
  meInFlight = (async () => {
    try {
      const res = await authFetch('/me', { method: 'GET' });
      if (res.status === 503) {
        // BE mid-restart (common during dev HMR) — keep session, do not treat as logged out.
        return null;
      }
      if (!res.ok) return { authenticated: false };
      const data = (await res.json()) as AuthMeResponse;
      const session = data.user?.session ?? data.session;
      if (session) updateSessionMeta(session);
      return data;
    } catch {
      return null;
    } finally {
      meInFlight = null;
    }
  })();
  return meInFlight;
}

export async function logoutBackend(options?: {
  /** Revoke all server sessions for this user (manual sign-out). */
  allDevices?: boolean;
}): Promise<void> {
  if (!useBackendSession()) return;
  try {
    await authFetch('/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allDevices: options?.allDevices === true }),
    });
  } catch {
    /* noop */
  }
  await clearSupabaseSessionAfterExchange();
  clearSessionMeta();
}

export async function refreshBackendSession(): Promise<boolean> {
  if (!useBackendSession()) return false;
  // Refresh token is httpOnly — rely on server cookie hint, not lingering CSRF alone.
  if (!hasSessionCookieHint()) return false;
  if (!getCsrfToken()) return false;
  try {
    const res = await authFetch('/refresh', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { session?: AuthSessionMeta } | null;
      if (data?.session) updateSessionMeta(data.session);
      return true;
    }
    if (res.status === 401 || res.status === 403) {
      clearStaleClientSessionHints();
    }
    return false;
  } catch {
    return false;
  }
}

/** Prefer this from app code — dedupes concurrent refresh across tabs. */
export async function refreshBackendSessionCoordinated(): Promise<boolean> {
  if (!useBackendSession()) return false;
  return coordinatedRefreshSession();
}

export async function heartbeatBackend(): Promise<boolean> {
  if (!useBackendSession()) return false;
  try {
    const res = await authFetch('/heartbeat', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
