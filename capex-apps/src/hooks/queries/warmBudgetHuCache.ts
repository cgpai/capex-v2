import type { QueryClient } from '@tanstack/react-query';
import type { BudgetPeriod } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import { fetchBudgetHuConfigBundle } from '@/screens/BudgetHU/fetchBudgetHuConfig';
import {
  compareBudgetPeriodRichness,
  mergeRicherBudgetPeriods,
  readBudgetHuConfigCacheAnyAge,
  readBudgetHuPageCacheAnyAge,
} from '@/lib/budgetHuDiskCache';
import {
  fetchBudgetHuPageRemote,
  isAppBudgetPeriodStructureShell,
  type BudgetHuRemoteBundle,
} from '@/hooks/queries/fetchBudgetHuPageData';
import { fetchBudgetHuProjectAssetCounts } from '@/services/budgetHuPageApi';

const CONFIG_STALE_MS = 30 * 60 * 1000;
const PAGE_STALE_MS = 5 * 60 * 1000;
const PREFETCH_TIMEOUT_MS = 8_000;

/** Hydrate TanStack Query from disk + prefetch (instant paint after F5). */
export function warmBudgetHuConfigCache(queryClient: QueryClient, userId: number): void {
  if (!Number.isFinite(userId)) return;

  const diskConfig = readBudgetHuConfigCacheAnyAge(userId);
  if (diskConfig) {
    queryClient.setQueryData(queryKeys.budgetHu.config(), diskConfig);
  }

  void queryClient.prefetchQuery({
    queryKey: queryKeys.budgetHu.config(),
    queryFn: () => fetchBudgetHuConfigBundle(userId),
    staleTime: CONFIG_STALE_MS,
  });
}

export function hydrateBudgetHuPageFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): boolean {
  if (!periodName.trim() || !Number.isFinite(userId)) return false;
  const disk = readBudgetHuPageCacheAnyAge(periodName, userId);
  if (!disk) return false;
  queryClient.setQueryData(queryKeys.budgetHu.page(periodName, userId), {
    ...disk,
    source: 'bundle' as const,
  });
  return true;
}

/** Warm config + disk hydrate only — full period bundle is HU-scoped on Budget HU page. */
export async function prefetchBudgetHuPage(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  options?: { awaitMs?: number; hospitalUnitId?: string },
): Promise<void> {
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return;
  warmBudgetHuConfigCache(queryClient, userId);
  hydrateBudgetHuPageFromDisk(queryClient, period, userId);

  const huId = String(options?.hospitalUnitId ?? '').trim();
  // Without a HU scope, do not pull the entire period tree (was the main load bottleneck).
  if (!huId) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.budgetHu.assetCounts(period, userId),
      queryFn: () => fetchBudgetHuProjectAssetCounts(period, userId),
      staleTime: PAGE_STALE_MS,
    });
    return;
  }

  const qk = queryKeys.budgetHu.page(period, userId, huId);
  const existingState = queryClient.getQueryState(qk);
  const existingData = queryClient.getQueryData<BudgetHuRemoteBundle>(qk);
  const isFresh =
    !!existingState?.dataUpdatedAt &&
    Date.now() - existingState.dataUpdatedAt < PAGE_STALE_MS &&
    !!existingData;
  if (isFresh) return;

  const prefetch = queryClient.prefetchQuery({
    queryKey: qk,
    queryFn: () =>
      fetchBudgetHuPageRemote(period, userId, {
        hospitalUnitId: huId,
        omitConfig: true,
      }),
    staleTime: PAGE_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.budgetHu.assetCounts(period, userId),
    queryFn: () => fetchBudgetHuProjectAssetCounts(period, userId),
    staleTime: PAGE_STALE_MS,
  });

  const cap = options?.awaitMs;
  if (cap != null && cap > 0) {
    await Promise.race([prefetch, new Promise<void>((r) => setTimeout(r, cap))]);
    return;
  }
  await prefetch;
}

export function prefetchBudgetHuPageWithTimeout(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  timeoutMs = PREFETCH_TIMEOUT_MS,
): Promise<void> {
  return prefetchBudgetHuPage(queryClient, periodName, userId, { awaitMs: timeoutMs });
}

/** Sync App shell period fetch into TanStack Query so Budget HU paints without a second round-trip. */
export function hydrateBudgetHuPeriodInQueryCache(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  period: BudgetPeriod,
): void {
  const periodKey = periodName.trim();
  if (!periodKey || !Number.isFinite(userId)) return;
  if (isAppBudgetPeriodStructureShell(period, periodKey)) return;

  queryClient.setQueryData(
    queryKeys.budgetHu.page(periodKey, userId),
    (old: BudgetHuRemoteBundle | undefined) => {
      const merged = mergeRicherBudgetPeriods(periodKey, old?.budgetPeriod, period);
      if (
        old?.budgetPeriod &&
        !isAppBudgetPeriodStructureShell(old.budgetPeriod, periodKey) &&
        compareBudgetPeriodRichness(merged, old.budgetPeriod) <= 0
      ) {
        return old;
      }
      return {
        budgetPeriod: merged ?? period,
        routineAssetMaxBudget: old?.routineAssetMaxBudget ?? 0,
        categories: old?.categories ?? [],
        priorities: old?.priorities ?? [],
        workflows: old?.workflows ?? [],
        assetTypes: old?.assetTypes ?? [],
        studies: old?.studies ?? [],
        source: 'bundle' as const,
      };
    },
  );
}
