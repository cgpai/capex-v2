import type { QueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import {
  buildBudgetMultiYearPageSeedFromCache,
  fetchBudgetMultiYearPageBundle,
  type BudgetMultiYearPageBundle,
} from '@/hooks/queries/fetchBudgetMultiYearPage';
import { queryKeys } from '@/lib/query-keys';

const STALE_MS = 120_000;

/** Seed instan dari bootstrap + disk config — tanpa network. */
export function hydrateBudgetMultiYearPageFromCache(
  queryClient: QueryClient,
  userId: number,
): BudgetMultiYearPageBundle | null {
  if (!Number.isFinite(userId)) return null;
  const seed = buildBudgetMultiYearPageSeedFromCache(queryClient, userId);
  if (!seed.multiYears.length) return null;
  queryClient.setQueryData(queryKeys.budgetMultiYear.page(userId), seed);
  return seed;
}

/** Warm cache saat shell siap / hover sidebar Multi-Year Budget. */
export function prefetchBudgetMultiYearPage(queryClient: QueryClient, userId: number): void {
  if (!Number.isFinite(userId)) return;
  const seed = hydrateBudgetMultiYearPageFromCache(queryClient, userId);
  if (seed?.multiYears.length && seed.categories.length) return;

  const qk = queryKeys.budgetMultiYear.page(userId);
  const state = queryClient.getQueryState(qk);
  if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < STALE_MS && queryClient.getQueryData(qk)) {
    return;
  }

  void queryClient.prefetchQuery({
    queryKey: qk,
    queryFn: () => fetchBudgetMultiYearPageBundle(queryClient),
    staleTime: STALE_MS,
  });
}

export function readBootstrapMultiYears(
  queryClient: QueryClient,
): AppBootstrapPayload['multiYears'] {
  const boot = queryClient.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  return boot?.multiYears?.length ? boot.multiYears : [];
}
