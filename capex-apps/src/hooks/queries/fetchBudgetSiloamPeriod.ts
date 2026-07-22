import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { withRequestCache } from '@/lib/requestCache';
import { isCapexBeConfigured, postToCapexBe } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { fetchConfigurationSlicesFromBackend } from '@/services/configurationApi';
import { trackBackendFetch } from '@/lib/backendFetchTelemetry';

export type BudgetSiloamPeriodBundle = {
  budgetPeriod: BudgetPeriod | null;
  categories: BudgetCategoryConfig[];
};

const PAGE_STALE_MS = 120_000;

function resolveUserId(userId?: number): number | null {
  if (userId != null && Number.isFinite(userId)) return userId;
  if (typeof window === 'undefined') return null;
  const fromSession = parseInt(sessionStorage.getItem('currentUserId') || '', 10);
  return Number.isFinite(fromSession) ? fromSession : null;
}

async function resolveAccessToken(): Promise<string | null> {
  if (useBackendSession() && typeof window !== 'undefined') {
    return null;
  }
  return getAccessTokenForBackend();
}

async function loadActiveCategories(userId: number | null): Promise<BudgetCategoryConfig[]> {
  if (userId != null && isCapexBeConfigured()) {
    try {
      const token = await resolveAccessToken();
      const fromBe = await fetchConfigurationSlicesFromBackend(token, userId, ['budgetCategories']);
      const categories = fromBe?.budgetCategories;
      if (Array.isArray(categories) && categories.length) {
        trackBackendFetch('budgetSiloam.categories', 'success');
        return categories.filter((c) => c.isActive);
      }
      trackBackendFetch('budgetSiloam.categories', 'fallback', { reason: 'empty_response' });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : NaN;
      trackBackendFetch('budgetSiloam.categories', 'fallback', {
        reason: 'http_error',
        ...(Number.isFinite(status) ? { httpStatus: status } : {}),
      });
    }
  }

  return [];
}

export type FetchBudgetSiloamOptions = {
  /** Bypass client + server cache (use after save). */
  skipCache?: boolean;
};

async function loadBudgetPeriodFromBackend(
  periodName: string,
  userId: number,
  skipCache = false,
): Promise<BudgetPeriod | null | undefined> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('budgetSiloam.period', 'fallback', { reason: 'missing_base_url' });
    return undefined;
  }

  try {
    const token = await resolveAccessToken();
    const body = await postToCapexBe<{ budgetPeriod?: BudgetPeriod | null }>(
      '/budget-hu/period',
      { periodName: periodName.trim(), userId, skipCache: skipCache || undefined },
      token,
    );
    trackBackendFetch('budgetSiloam.period', 'success');
    return body.budgetPeriod ?? null;
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status)
        : NaN;
    trackBackendFetch('budgetSiloam.period', 'fallback', {
      reason: 'http_error',
      ...(Number.isFinite(status) ? { httpStatus: status } : {}),
    });
    return undefined;
  }
}

async function loadBudgetPeriodFromNetwork(
  periodName: string,
  userId: number | null,
  skipCache = false,
): Promise<BudgetPeriod | null> {
  if (userId != null) {
    const fromBe = await loadBudgetPeriodFromBackend(periodName, userId, skipCache);
    if (fromBe !== undefined) {
      return fromBe;
    }
  }

  return null;
}

export async function fetchBudgetSiloamPeriodBundle(
  periodName: string,
  userId?: number,
  options?: FetchBudgetSiloamOptions,
): Promise<BudgetSiloamPeriodBundle> {
  const period = periodName.trim();
  if (!period) {
    return { budgetPeriod: null, categories: [] };
  }

  const uid = resolveUserId(userId);
  const skipCache = options?.skipCache === true;
  const loader = async (): Promise<BudgetSiloamPeriodBundle> => {
    const [budgetPeriod, categories] = await Promise.all([
      loadBudgetPeriodFromNetwork(period, uid, skipCache),
      loadActiveCategories(uid),
    ]);
    return { budgetPeriod, categories };
  };

  if (skipCache) {
    return loader();
  }

  const cacheKey =
    uid != null
      ? `budget-siloam:bundle:${uid}:${period.toLowerCase()}`
      : `budget-siloam:bundle:anon:${period.toLowerCase()}`;

  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}

/** Warm Siloam screen cache (sidebar hover / period change). */
export function prefetchBudgetSiloamPeriodBundle(
  queryClient: QueryClient,
  periodName: string,
  userId?: number,
): void {
  const period = periodName.trim();
  if (!period) return;
  void queryClient.prefetchQuery({
    queryKey: queryKeys.budgetSiloamPeriod.detail(period),
    queryFn: () => fetchBudgetSiloamPeriodBundle(period, userId),
    staleTime: PAGE_STALE_MS,
  });
}
