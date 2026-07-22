import type { User } from '../types';

const STORAGE_KEY = 'capex.authUser.v1';

/** Persisted fields only — no email/phone (PII stays from /auth/me in memory). */
type AuthUserCacheSnapshot = {
  id: number;
  username: string;
  assignments: User['assignments'];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** User + id sesi untuk paint pertama setelah reload (tanpa tunggu /auth/me). */
export function readInitialAuthUser(): User | null {
  if (typeof window === 'undefined') return null;
  const cached = readCachedAuthUser();
  if (!cached) return null;
  try {
    sessionStorage.setItem('currentUserId', String(cached.id));
  } catch {
    /* private mode */
  }
  return cached;
}

/** Baca user terakhir dari localStorage — id, username, assignments only. */
export function readCachedAuthUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!isRecord(o)) return null;
    const id = Number(o.id);
    const username = typeof o.username === 'string' ? o.username : '';
    const assignments = Array.isArray(o.assignments) ? (o.assignments as User['assignments']) : [];
    if (!Number.isFinite(id) || !username) return null;
    return { id, username, email: '', assignments };
  } catch {
    return null;
  }
}

export function writeCachedAuthUser(user: User): void {
  if (typeof window === 'undefined') return;
  try {
    let assignments = user.assignments ?? [];
    if (assignments.length === 0) {
      const existing = readCachedAuthUser();
      if (existing?.id === user.id && (existing.assignments?.length ?? 0) > 0) {
        assignments = existing.assignments;
      }
    }
    const snapshot: AuthUserCacheSnapshot = {
      id: user.id,
      username: user.username,
      assignments,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedAuthUser(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
