import type { AssetTypeConfig, BudgetCategoryConfig, BudgetPeriod, ProjectPriorityConfig, WorkflowSet } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useBackendSession } from '../lib/auth/authConstants';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { capexBeRequestUrl } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { withRequestCache, invalidateRequestCache } from '../lib/requestCache';
import { resolveMyTasksAccessToken } from './myTasksApi';

async function budgetHuRequestHeaders(): Promise<Record<string, string> | null> {
  const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  if (!useBackendSession() && !token) return null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type BudgetHuConfigBundle = {
  routineAssetMaxBudget: number;
  categories: BudgetCategoryConfig[];
  priorities: ProjectPriorityConfig[];
  workflows: WorkflowSet[];
  assetTypes: AssetTypeConfig[];
};

export type BudgetHuPageBundle = {
  budgetPeriod: BudgetPeriod | null;
  routineAssetMaxBudget: number;
  categories: BudgetCategoryConfig[];
  priorities: ProjectPriorityConfig[];
  workflows: WorkflowSet[];
  assetTypes: AssetTypeConfig[];
  studies: Array<{ id: string; projectId: string; conclusion: string }>;
};

/**
 * Hanya pohon `BudgetPeriod` — ringan untuk App shell (`currentBudgetPeriod`), tanpa master form.
 */
export async function fetchBudgetPeriodOnlyFromBackend(
  periodName: string,
  userId: number,
): Promise<BudgetPeriod | null> {
  const cacheKey = `app:table:budget-hu:period:${userId}:${periodName.trim().toLowerCase()}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim()) {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'invalid_request' });
        return null;
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'missing_access_token' });
        return null;
      }
      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/period'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: periodName.trim(), userId }),
        });

        if (!res.ok) {
          trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'http_error', httpStatus: res.status });
          return null;
        }
        const body = (await res.json()) as { budgetPeriod: BudgetPeriod | null };
        trackBackendFetch('budgetHu.periodOnly', 'success');
        return body.budgetPeriod ?? null;
      } catch {
        trackBackendFetch('budgetHu.periodOnly', 'fallback', { reason: 'network_error' });
        return null;
      }
    },
    5 * 60 * 1000,
  );
}

/** Master data for HU forms — Redis-backed on Nest when REDIS_URL is set. */
export async function fetchBudgetHuConfigFromBackend(userId: number): Promise<BudgetHuConfigBundle | null> {
  const cacheKey = 'app:master:budget-hu:config';
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !Number.isFinite(userId)) {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'invalid_request' });
        return null;
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'missing_access_token' });
        return null;
      }

      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/config-bundle'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: '_', userId }),
        });
        if (!res.ok) {
          trackBackendFetch('budgetHu.config', 'fallback', { reason: 'http_error', httpStatus: res.status });
          return null;
        }
        const data = (await res.json()) as Partial<BudgetHuConfigBundle>;
        trackBackendFetch('budgetHu.config', 'success');
        return {
          routineAssetMaxBudget: Number(data.routineAssetMaxBudget ?? 0) || 0,
          categories: Array.isArray(data.categories) ? data.categories : [],
          priorities: Array.isArray(data.priorities) ? data.priorities : [],
          workflows: Array.isArray(data.workflows) ? data.workflows : [],
          assetTypes: Array.isArray(data.assetTypes) ? data.assetTypes : [],
        };
      } catch {
        trackBackendFetch('budgetHu.config', 'fallback', { reason: 'network_error' });
        return null;
      }
    },
    30 * 60 * 1000,
  );
}

export async function invalidateBudgetHuBackendCache(
  periodName: string,
  userId: number,
): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!base || !periodName.trim()) return;

  const headers = await budgetHuRequestHeaders();
  if (!headers) return;

  try {
    await authenticatedFetch(capexBeRequestUrl('/budget-hu/invalidate-cache'), {
      method: 'POST',
      headers,
      credentials: useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ periodName: periodName.trim(), userId }),
    });
  } catch {
    /* fallback: client caches expire via TTL */
  }
}

/**
 * Satu request ke Nest: BudgetPeriod lengkap + konfigurasi form (paralel di server).
 * Menghindari banyak round-trip Supabase dari browser.
 */
export async function fetchBudgetHuPageBundle(
  periodName: string,
  userId: number,
  options?: { skipCache?: boolean; hospitalUnitId?: string; omitConfig?: boolean },
): Promise<BudgetHuPageBundle | null> {
  const huId = String(options?.hospitalUnitId ?? '').trim();
  const cacheKey = huId
    ? `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}:hu:${huId}`
    : `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}`;
  const skipCache = options?.skipCache === true;
  if (skipCache) {
    invalidateRequestCache(cacheKey);
  }

  const run = async (): Promise<BudgetHuPageBundle | null> => {
    const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
    if (!base || !periodName.trim()) {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'invalid_request' });
      return null;
    }

    const headers = await budgetHuRequestHeaders();
    if (!headers) {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'missing_access_token' });
      return null;
    }
    try {
      const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/page-bundle'), {
        method: 'POST',
        headers,
        credentials: useBackendSession() ? 'include' : 'same-origin',
        body: JSON.stringify({
          periodName: periodName.trim(),
          userId,
          skipCache,
          hospitalUnitId: huId || undefined,
          omitConfig: options?.omitConfig === true,
        }),
      });

      if (!res.ok) {
        trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'http_error', httpStatus: res.status });
        return null;
      }
      trackBackendFetch('budgetHu.bundle', 'success');
      const data = (await res.json()) as Partial<BudgetHuPageBundle>;
      return {
        budgetPeriod: data.budgetPeriod ?? null,
        routineAssetMaxBudget: Number(data.routineAssetMaxBudget ?? 0) || 0,
        categories: Array.isArray(data.categories) ? data.categories : [],
        priorities: Array.isArray(data.priorities) ? data.priorities : [],
        workflows: Array.isArray(data.workflows) ? data.workflows : [],
        assetTypes: Array.isArray(data.assetTypes) ? data.assetTypes : [],
        studies: Array.isArray(data.studies) ? data.studies : [],
      };
    } catch {
      trackBackendFetch('budgetHu.bundle', 'fallback', { reason: 'network_error' });
      return null;
    }
  };

  if (skipCache) return run();
  return withRequestCache(cacheKey, run, 5 * 60 * 1000);
}

/** Per-project asset counts for the period — lightweight vs full page bundle. */
export async function fetchBudgetHuProjectAssetCounts(
  periodName: string,
  userId: number,
): Promise<Record<string, number>> {
  const cacheKey = `app:table:budget-hu:asset-counts:${userId}:${periodName.trim().toLowerCase()}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
      if (!base || !periodName.trim()) {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'invalid_request' });
        return {};
      }

      const headers = await budgetHuRequestHeaders();
      if (!headers) {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'missing_access_token' });
        return {};
      }
      try {
        const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/project-asset-counts'), {
          method: 'POST',
          headers,
          credentials: useBackendSession() ? 'include' : 'same-origin',
          body: JSON.stringify({ periodName: periodName.trim(), userId }),
        });
        if (!res.ok) {
          trackBackendFetch('budgetHu.assetCounts', 'fallback', {
            reason: 'http_error',
            httpStatus: res.status,
          });
          return {};
        }
        trackBackendFetch('budgetHu.assetCounts', 'success');
        const body = (await res.json()) as Record<string, number>;
        return body && typeof body === 'object' ? body : {};
      } catch {
        trackBackendFetch('budgetHu.assetCounts', 'fallback', { reason: 'network_error' });
        return {};
      }
    },
    5 * 60 * 1000,
  );
}

export type BudgetHuSyncStamp = {
  fingerprint: string;
  projectSignature: string;
  projectCount: number;
  assetCount: number;
};

/**
 * Uncached change stamp for one HU — polled while Budget HU is open so peers
 * see creates/updates without relying on Supabase Realtime auth.
 */
export async function fetchBudgetHuSyncStamp(
  periodName: string,
  userId: number,
  hospitalUnitId: string,
): Promise<BudgetHuSyncStamp | null> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  const pn = periodName.trim();
  const huId = hospitalUnitId.trim();
  if (!base || !pn || !huId || !Number.isFinite(userId)) return null;

  const headers = await budgetHuRequestHeaders();
  if (!headers) return null;

  try {
    const res = await authenticatedFetch(capexBeRequestUrl('/budget-hu/hu-sync-stamp'), {
      method: 'POST',
      headers,
      credentials: useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ periodName: pn, userId, hospitalUnitId: huId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<BudgetHuSyncStamp>;
    const fingerprint = String(body.fingerprint ?? '').trim();
    if (!fingerprint) return null;
    return {
      fingerprint,
      projectSignature: String(body.projectSignature ?? '').trim(),
      projectCount: Number(body.projectCount ?? 0) || 0,
      assetCount: Number(body.assetCount ?? 0) || 0,
    };
  } catch {
    return null;
  }
}
