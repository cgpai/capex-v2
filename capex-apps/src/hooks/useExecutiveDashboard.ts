import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Archetype } from '../types';
import { isBackendConfigured } from '../lib/backendApiClient';
import { queryKeys } from '../lib/query-keys';
import { buildFiltersKey, mapPeriodHeaderFromMeta } from '../lib/executiveSummary/selectors';
import {
  EMPTY_EXECUTIVE_DASHBOARD,
  type ExecutiveDashboardMetrics,
} from '../lib/executiveSummary/dashboardTypes';
import type { ExecutiveSummaryPeriodForHeader } from '../lib/executiveSummary/types';
import { fetchExecutiveDashboardMetricsFromBackend } from '../services/executiveSummaryApi';

const STALE_TIME_MS = 60_000;

export type UseExecutiveDashboardParams = {
  periodName: string;
  userId: number;
  selectedArchetypeId: string | null;
};

function periodHeaderFallback(periodName: string): ExecutiveSummaryPeriodForHeader {
  return {
    periodName,
    startDate: '',
    endDate: '',
    multiYearName: '',
  };
}

export function useExecutiveDashboard({
  periodName,
  userId,
  selectedArchetypeId,
}: UseExecutiveDashboardParams) {
  const filtersKey = useMemo(
    () => buildFiltersKey({ archetypeId: selectedArchetypeId, capexType: 'all', status: 'all', huCodes: [] }),
    [selectedArchetypeId],
  );

  const dashboardQuery = useQuery({
    queryKey: queryKeys.executiveSummary.dashboard(periodName, userId, filtersKey),
    queryFn: async () => {
      if (isBackendConfigured()) {
        const data = await fetchExecutiveDashboardMetricsFromBackend(periodName, userId, {
          archetypeId: selectedArchetypeId,
          capexType: 'all',
          status: 'all',
          huCodes: [],
        });
        if (data) return data;
        throw new Error('Gagal memuat Executive Dashboard. Pastikan backend capexbe berjalan.');
      }
      return EMPTY_EXECUTIVE_DASHBOARD;
    },
    enabled: Boolean(periodName),
    staleTime: STALE_TIME_MS,
  });

  const metrics = dashboardQuery.data ?? EMPTY_EXECUTIVE_DASHBOARD;

  const periodHeader: ExecutiveSummaryPeriodForHeader = useMemo(() => {
    return mapPeriodHeaderFromMeta(metrics.periodMeta) ?? (periodName ? periodHeaderFallback(periodName) : null);
  }, [metrics.periodMeta, periodName]);

  /** True while metrics for the current filter are not ready (first open or filter change). */
  const showMetricsSkeleton =
    Boolean(periodName) &&
    (dashboardQuery.isPending ||
      (dashboardQuery.isFetching && dashboardQuery.isPlaceholderData));

  const isInitialLoad = showMetricsSkeleton;
  const isMetricsLoading = showMetricsSkeleton;
  const isLoading = showMetricsSkeleton;
  const isRefreshing =
    Boolean(periodName) && dashboardQuery.isFetching && !showMetricsSkeleton;

  const errorMessage =
    dashboardQuery.isError
      ? dashboardQuery.error instanceof Error
        ? dashboardQuery.error.message
        : 'Failed to load executive dashboard.'
      : null;

  const hasNoDashboardData =
    metrics.summary.totalBudget === 0 &&
    metrics.summary.budgetAllocationToProject === 0 &&
    metrics.summary.totalCapexSubmission === 0 &&
    metrics.budgetByUnit.length === 0;

  return {
    periodHeader,
    metrics,
    isLoading,
    isMetricsLoading,
    isInitialLoad,
    isRefreshing,
    showMetricsSkeleton,
    errorMessage,
    hasPeriod: Boolean(periodName),
    hasNoDashboardData:
      Boolean(periodName) && !showMetricsSkeleton && !errorMessage && hasNoDashboardData,
    filtersKey,
  };
}

export type { ExecutiveDashboardMetrics, Archetype };
