import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetMultiYear, BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { readConfigurationPackCacheAnyAge } from '@/lib/configurationDiskCache';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { useBackendSession } from '@/lib/auth/authConstants';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { fetchConfigurationSlicesFromBackend } from '@/services/configurationApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { withRequestCache } from '@/lib/requestCache';
import {
  fetchBudgetMultiYearPageBundleFromBackend,
  fetchMultiYearPeriodBudgetsFromBackend,
} from '@/services/budgetMultiYearPageApi';

export type BudgetMultiYearPageBundle = {
  multiYears: BudgetMultiYear[];
  categories: BudgetCategoryConfig[];
};

const PAGE_STALE_MS = 120_000;

async function resolveBootstrapUserId(queryClient?: QueryClient): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  const fromSession = sessionStorage.getItem('currentUserId');
  if (fromSession) {
    const uid = parseInt(fromSession, 10);
    if (Number.isFinite(uid)) return uid;
  }
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const fromBootstrap = bootstrap?.users?.[0]?.id;
  return fromBootstrap != null && Number.isFinite(fromBootstrap) ? fromBootstrap : null;
}

function readCategoriesFromLocalCache(
  queryClient: QueryClient | undefined,
  userId: number | null,
): BudgetCategoryConfig[] {
  if (userId == null) return [];
  const fromQuery = queryClient?.getQueryData<Partial<ConfigurationDataPack>>(
    queryKeys.configuration.page(userId),
  );
  const fromDisk = readConfigurationPackCacheAnyAge(userId);
  const raw = fromQuery?.budgetCategories ?? fromDisk?.budgetCategories ?? [];
  return raw.filter((c) => c.isActive);
}

function pickMultiYears(
  primary: BudgetMultiYear[] | undefined,
  fallback: BudgetMultiYear[] | undefined,
): BudgetMultiYear[] {
  if (primary?.length) return primary;
  if (fallback?.length) return fallback;
  return [];
}

/** Paint instan: bootstrap multi-year + kategori dari cache konfigurasi. */
export function buildBudgetMultiYearPageSeedFromCache(
  queryClient: QueryClient | undefined,
  userId: number | null,
): BudgetMultiYearPageBundle {
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const multiYears = bootstrap?.multiYears?.length ? bootstrap.multiYears : [];
  const categories = readCategoriesFromLocalCache(queryClient, userId);
  return { multiYears, categories };
}

async function loadActiveCategories(
  queryClient: QueryClient | undefined,
  userId: number | null,
): Promise<BudgetCategoryConfig[]> {
  const cached = readCategoriesFromLocalCache(queryClient, userId);
  if (cached.length) return cached;

  const preferBackend = isCapexBeConfigured() && (useBackendSession() || userId != null);
  if (preferBackend && userId != null) {
    const token = useBackendSession() ? null : await getAccessTokenForBackend();
    const fromBe = await fetchConfigurationSlicesFromBackend(token, userId, ['budgetCategories']);
    const categories = fromBe?.budgetCategories;
    if (Array.isArray(categories) && categories.length) {
      return categories.filter((c) => c.isActive);
    }
  }

  return [];
}

async function fetchPageBundleFromNetwork(
  queryClient: QueryClient | undefined,
  userId: number | null,
): Promise<BudgetMultiYearPageBundle | null> {
  const bootstrap = queryClient?.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const cachedMultiYears = bootstrap?.multiYears?.length ? bootstrap.multiYears : null;

  if (userId != null && isCapexBeConfigured()) {
    const fromBe = await fetchBudgetMultiYearPageBundleFromBackend(userId);
    if (fromBe) {
      const categories = fromBe.categories.length
        ? fromBe.categories.filter((c) => c.isActive)
        : await loadActiveCategories(queryClient, userId);
      return {
        multiYears: pickMultiYears(fromBe.multiYears, cachedMultiYears ?? undefined),
        categories,
      };
    }
  }

  const [multiYears, categories] = await Promise.all([
    cachedMultiYears ?? Promise.resolve([]),
    loadActiveCategories(queryClient, userId),
  ]);

  return {
    multiYears: pickMultiYears(multiYears, cachedMultiYears ?? undefined),
    categories,
  };
}

/**
 * Muat multi-year + kategori — seed cache dulu (<50ms), network hanya bila seed belum lengkap.
 */
export async function fetchBudgetMultiYearPageBundle(
  queryClient?: QueryClient,
): Promise<BudgetMultiYearPageBundle> {
  const userId = await resolveBootstrapUserId(queryClient);
  const seed = buildBudgetMultiYearPageSeedFromCache(queryClient, userId);

  if (seed.multiYears.length && seed.categories.length) {
    return seed;
  }

  const cacheKey = userId != null ? `budget-multi-year:page:${userId}` : 'budget-multi-year:page:anon';
  return withRequestCache(
    cacheKey,
    () => fetchPageBundleFromNetwork(queryClient, userId).then((r) => r ?? seed),
    PAGE_STALE_MS,
  );
}

export async function fetchMultiYearPeriodBudgets(
  multiYearName: string,
  userId?: number,
): Promise<{ periods: BudgetPeriod[]; categories: BudgetCategoryConfig[] }> {
  const uid =
    userId ??
    (typeof window !== 'undefined' ? parseInt(sessionStorage.getItem('currentUserId') || '', 10) : NaN);
  const name = multiYearName.trim();
  const cacheKey =
    Number.isFinite(uid) && name
      ? `budget-multi-year:period-budgets:${uid}:${name.toLowerCase()}`
      : null;

  const loader = async (): Promise<{ periods: BudgetPeriod[]; categories: BudgetCategoryConfig[] }> => {
    if (Number.isFinite(uid) && isCapexBeConfigured()) {
      const fromBe = await fetchMultiYearPeriodBudgetsFromBackend(uid, name);
      if (fromBe) return fromBe;
    }

    return { periods: [], categories: [] };
  };

  if (!cacheKey) return loader();
  return withRequestCache(cacheKey, loader, PAGE_STALE_MS);
}
