import type { UserRole } from '../types';

const STORAGE_KEY = 'capex.allRoles.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRole(raw: unknown): UserRole | null {
  if (!isRecord(raw)) return null;
  const id = Number(raw.id);
  const roleName = typeof raw.roleName === 'string' ? raw.roleName : '';
  if (!Number.isFinite(id) || !roleName) return null;
  const permissions = Array.isArray(raw.permissions)
    ? (raw.permissions as UserRole['permissions'])
    : [];
  return { id, roleName, permissions };
}

/** Role master terakhir — dipakai paint pertama sidebar setelah reload (sebelum bootstrap). */
export function readCachedRoles(): UserRole[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseRole).filter((r): r is UserRole => r != null);
  } catch {
    return [];
  }
}

export function writeCachedRoles(roles: UserRole[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedRoles(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
