import type { BudgetMultiYear, BudgetPeriod, User, UserRole } from '../types';
import { capexBeRequestUrl, useBeBffProxy } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';

export type AppInitPack = {
  users: User[];
  roles: UserRole[];
  multiYears: BudgetMultiYear[];
  periodSummaries: BudgetPeriod[];
};

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 12000;
const MAX_BOOTSTRAP_ATTEMPTS = 2;

/**
 * Satu request ke Nest: users + roles + multi-year + ringkasan periode (paralel di server).
 * Backend httpOnly: cookie via BFF `/api/be/bootstrap`. Legacy: Bearer Supabase + userId.
 */
export async function fetchAppInitPackFromBackend(
  accessToken: string | null | undefined,
  userId: number,
): Promise<AppInitPack | null> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!base) return null;
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;
  const bff = useBeBffProxy();
  const backendSession = useBackendSession();
  if (!bff && !backendSession && !accessToken?.trim()) return null;

  const invoke = async (): Promise<AppInitPack | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken?.trim()) {
        headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
      const res = await (bff || backendSession ? authenticatedFetch : fetch)(
        capexBeRequestUrl('/bootstrap'),
        {
          method: 'POST',
          headers,
          credentials: bff || backendSession ? 'include' : 'same-origin',
          body: JSON.stringify({ userId: uid }),
          signal: controller.signal,
          ...(bff || backendSession ? { retryOn401: true } : {}),
        },
      );

      if (!res.ok) return null;

      const json = (await res.json()) as Partial<AppInitPack> | null;
      if (!json || !Array.isArray(json.users) || !Array.isArray(json.roles)) return null;

      return {
        users: json.users,
        roles: json.roles,
        multiYears: Array.isArray(json.multiYears) ? json.multiYears : [],
        periodSummaries: Array.isArray(json.periodSummaries) ? json.periodSummaries : [],
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  for (let attempt = 1; attempt <= MAX_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    const result = await invoke();
    if (result) return result;
    if (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  return null;
}
