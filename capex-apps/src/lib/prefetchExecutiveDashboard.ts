import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { buildFiltersKey } from '@/lib/executiveSummary/selectors';
import { fetchExecutiveDashboardMetricsFromBackend } from '@/services/executiveSummaryApi';

const STALE_TIME_MS = 60_000;

/** Warm CEO dashboard cache before navigating to Executive Summary. */
export function prefetchExecutiveDashboard(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  archetypeId: string | null = null,
): void {
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return;

  const filtersKey = buildFiltersKey({
    archetypeId,
    capexType: 'all',
    status: 'all',
    huCodes: [],
  });

  void import('@/screens/ExecutiveSummaryPage');
  void queryClient.prefetchQuery({
    queryKey: queryKeys.executiveSummary.dashboard(period, userId, filtersKey),
    queryFn: () =>
      fetchExecutiveDashboardMetricsFromBackend(period, userId, {
        archetypeId,
        capexType: 'all',
        status: 'all',
        huCodes: [],
      }),
    staleTime: STALE_TIME_MS,
  });
}
