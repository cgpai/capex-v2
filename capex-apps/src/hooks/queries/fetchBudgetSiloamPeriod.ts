import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { resolveDefaultBudgetCategoryId } from '@/lib/budgetSiloamCategoryMerge';
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

type PeriodBackendOptions = {
  skipCache?: boolean;
  networkShell?: boolean;
  categoryId?: string;
  networkView?: boolean;
};

async function loadBudgetPeriodFromBackend(
  periodName: string,
  userId: number,
  opts: PeriodBackendOptions = {},
): Promise<BudgetPeriod | null | undefined> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('budgetSiloam.period', 'fallback', { reason: 'missing_base_url' });
    return undefined;
  }

  try {
    const token = await resolveAccessToken();
    const body = await postToCapexBe<{ budgetPeriod?: BudgetPeriod | null }>(
      '/budget-hu/period',
      {
        periodName: periodName.trim(),
        userId,
        skipCache: opts.skipCache || undefined,
        networkView: opts.networkView ?? opts.networkShell ?? !!opts.categoryId,
        networkShell: opts.networkShell || undefined,
        categoryId: opts.categoryId || undefined,
      },
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

export type FetchBudgetSiloamOptions = {
  skipCache?: boolean;
};

/** Shell only — period totals + archetype/HU plans, no projects (fast mount). */
export async function fetchBudgetSiloamShellBundle(
  periodName: string,
  userId?: number,
  options?: FetchBudgetSiloamOptions,
): Promise<BudgetSiloamPeriodBundle> {
  const period = periodName.trim();
  if (!period) return { budgetPeriod: null, categories: [] };

  const uid = resolveUserId(userId);
  const skipCache = options?.skipCache === true;
  const loader = async (): Promise<BudgetSiloamPeriodBundle> => {
    const [budgetPeriod, categories] = await Promise.all([
      uid != null
        ? loadBudgetPeriodFromBackend(period, uid, { skipCache, networkShell: true })
        : Promise.resolve(null),
      loadActiveCategories(uid),
    ]);
    return { budgetPeriod: budgetPeriod ?? null, categories };
  };

  if (skipCache) return loader();

  const cacheKey =
    uid != null
      ? `budget-siloam:shell:${uid}:${period.toLowerCase()}`
      : `budget-siloam:shell:anon:${period.toLowerCase()}`;

  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}

/** One budget category — projects + live aggregates (on tab click). */
export async function fetchBudgetSiloamCategorySlice(
  periodName: string,
  categoryId: string,
  userId?: number,
  options?: FetchBudgetSiloamOptions,
): Promise<BudgetPeriod | null> {
  const period = periodName.trim();
  const cat = String(categoryId ?? '').trim();
  if (!period || !cat) return null;

  const uid = resolveUserId(userId);
  if (uid == null) return null;

  const skipCache = options?.skipCache === true;
  const loader = async () => {
    const fromBe = await loadBudgetPeriodFromBackend(period, uid, {
      skipCache,
      categoryId: cat,
      networkView: true,
    });
    return fromBe ?? null;
  };

  if (skipCache) return loader();

  const cacheKey = `budget-siloam:category:${uid}:${period.toLowerCase()}:${cat.toLowerCase()}`;
  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}

/** Full network tree (all categories) — Budget Archetype / legacy paths. */
export async function fetchBudgetSiloamFullNetworkBundle(
  periodName: string,
  userId?: number,
  options?: FetchBudgetSiloamOptions,
): Promise<BudgetSiloamPeriodBundle> {
  const period = periodName.trim();
  if (!period) return { budgetPeriod: null, categories: [] };

  const uid = resolveUserId(userId);
  const skipCache = options?.skipCache === true;
  const loader = async (): Promise<BudgetSiloamPeriodBundle> => {
    const [budgetPeriod, categories] = await Promise.all([
      uid != null
        ? loadBudgetPeriodFromBackend(period, uid, { skipCache, networkView: true })
        : Promise.resolve(null),
      loadActiveCategories(uid),
    ]);
    return { budgetPeriod: budgetPeriod ?? null, categories };
  };

  if (skipCache) return loader();

  const cacheKey =
    uid != null
      ? `budget-siloam:full-network:${uid}:${period.toLowerCase()}`
      : `budget-siloam:full-network:anon:${period.toLowerCase()}`;

  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}

/** @deprecated Use fetchBudgetSiloamShellBundle + fetchBudgetSiloamCategorySlice. */
export async function fetchBudgetSiloamPeriodBundle(
  periodName: string,
  userId?: number,
  options?: FetchBudgetSiloamOptions,
): Promise<BudgetSiloamPeriodBundle> {
  return fetchBudgetSiloamShellBundle(periodName, userId, options);
}

/** Warm shell + Revenue Maintenance (default tab) on nav hover. */
export function prefetchBudgetSiloamPeriodBundle(
  queryClient: QueryClient,
  periodName: string,
  userId?: number,
): void {
  const period = periodName.trim();
  if (!period) return;
  void queryClient
    .prefetchQuery({
      queryKey: queryKeys.budgetSiloamPeriod.shell(period),
      queryFn: () => fetchBudgetSiloamShellBundle(period, userId),
      staleTime: PAGE_STALE_MS,
    })
    .then(() => {
      const shell = queryClient.getQueryData<BudgetSiloamPeriodBundle>(
        queryKeys.budgetSiloamPeriod.shell(period),
      );
      const defaultCategoryId = resolveDefaultBudgetCategoryId(shell?.categories ?? []);
      if (!defaultCategoryId) return;
      void queryClient.prefetchQuery({
        queryKey: queryKeys.budgetSiloamPeriod.category(period, defaultCategoryId),
        queryFn: () => fetchBudgetSiloamCategorySlice(period, defaultCategoryId, userId),
        staleTime: PAGE_STALE_MS,
      });
    });
}
