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

import { normalizeExecutiveDashboardMetrics } from '../lib/executiveSummary/normalizeDashboardMetrics';

import type { ExecutiveSummaryPeriodForHeader } from '../lib/executiveSummary/types';

import {

  fetchExecutiveDashboardMetricsFromBackend,

  fetchExecutiveSummaryPageMetaFromBackend,

} from '../services/executiveSummaryApi';



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



  const metaQuery = useQuery({

    queryKey: queryKeys.executiveSummary.meta(periodName, userId),

    queryFn: async () => {

      if (isBackendConfigured()) {

        const meta = await fetchExecutiveSummaryPageMetaFromBackend(periodName, userId);

        if (meta) return meta;

      }

      return { periodName, periodMeta: null, hospitalUnits: [], archetypes: [] };

    },

    enabled: Boolean(periodName),

    staleTime: STALE_TIME_MS,

  });



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

        if (data) return normalizeExecutiveDashboardMetrics(data);

        throw new Error('Gagal memuat Executive Dashboard. Pastikan backend capexbe berjalan.');

      }

      return EMPTY_EXECUTIVE_DASHBOARD;

    },

    enabled: Boolean(periodName),

    staleTime: STALE_TIME_MS,

    placeholderData: (prev) => prev,

  });



  const metrics = useMemo(

    () => normalizeExecutiveDashboardMetrics(dashboardQuery.data),

    [dashboardQuery.data],

  );



  const periodHeader: ExecutiveSummaryPeriodForHeader = useMemo(() => {

    const meta =

      metrics.periodMeta ??

      metaQuery.data?.periodMeta ??

      null;

    return mapPeriodHeaderFromMeta(meta) ?? (periodName ? periodHeaderFallback(periodName) : null);

  }, [metrics.periodMeta, metaQuery.data?.periodMeta, periodName]);



  const isLoading = Boolean(periodName) && dashboardQuery.isPending;

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

    isRefreshing: dashboardQuery.isFetching && !dashboardQuery.isPending,

    errorMessage,

    hasPeriod: Boolean(periodName),

    hasNoDashboardData: Boolean(periodName) && !isLoading && !errorMessage && hasNoDashboardData,

  };

}



export type { ExecutiveDashboardMetrics, Archetype };


