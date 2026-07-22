import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { DASHBOARD_STALE_TIME_MS } from '@/lib/dashboard/constants';
import { fetchDashboardBundle } from '@/hooks/queries/fetchDashboardBundle';

/** Warm dashboard cache as soon as period + user are known (before navigating to Dashboard). */
export function prefetchDashboardBundle(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): void {
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return;
  void import('@/components/organisms/Dashboard/DashboardChartsSection');
  void queryClient.prefetchQuery({
    queryKey: queryKeys.dashboard.bundle(period, userId),
    queryFn: () => fetchDashboardBundle(period, userId),
    staleTime: DASHBOARD_STALE_TIME_MS,
  });
}
