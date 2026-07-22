import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Archetype } from '../types';
import { isBackendConfigured } from '../lib/backendApiClient';
import { queryKeys } from '../lib/query-keys';
import { useDebouncedValue } from './useDebouncedValue';
import {
  fetchExecutiveSummaryPageMetaFromBackend,
  fetchExecutiveSummaryProjectsPageFromBackend,
  fetchExecutiveSummaryStatsFromBackend,
} from '../services/executiveSummaryApi';
import {
  buildExecutiveSummaryViewModel,
  buildPlanningBudgetScoringItems,
  buildPulseFromProjects,
  visibleUnitsFromArchetypes,
  type CapexTypeFilter,
  type ExecutiveSummaryFilters,
  type StatusFilter,
} from '../lib/executiveSummary/utils';
import {
  buildFiltersKey,
  buildStatusListsFromStats,
  mapPeriodHeaderFromMeta,
} from '../lib/executiveSummary/selectors';
import {
  EXECUTIVE_SEARCH_DEBOUNCE_MS,
  EXECUTIVE_TABLE_PAGE_SIZE,
} from '../lib/executiveSummary/constants';
import type {
  EnrichedExecutiveProject,
  ExecutiveSummaryPeriodForHeader,
  ExecutiveSummaryStats,
  ProjectSortField,
  SortDir,
} from '../lib/executiveSummary/types';
import { EMPTY_EXECUTIVE_PULSE } from '../lib/executiveSummary/types';
import { fetchExecutiveSummaryBundle } from './queries/fetchExecutiveSummaryBundle';

const STALE_TIME_MS = 60_000;

const DEFAULT_FILTERS = {
  capexType: 'all' as CapexTypeFilter,
  status: 'all' as StatusFilter,
  huCodes: [] as string[],
};

export type UseExecutiveSummaryPageParams = {
  periodName: string;
  userId: number;
  selectedArchetypeId: string | null;
  visibleArchetypes?: Archetype[];
};

export function useExecutiveSummaryPage({
  periodName,
  userId,
  selectedArchetypeId,
  visibleArchetypes,
}: UseExecutiveSummaryPageParams) {
  const queryClient = useQueryClient();
  const [capexType, setCapexType] = useState<CapexTypeFilter>(DEFAULT_FILTERS.capexType);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_FILTERS.status);
  const [huCodes, setHuCodes] = useState<string[]>(DEFAULT_FILTERS.huCodes);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSortField>('project_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const debouncedSearch = useDebouncedValue(search, EXECUTIVE_SEARCH_DEBOUNCE_MS);

  const filters: ExecutiveSummaryFilters = useMemo(
    () => ({
      archetypeId: selectedArchetypeId,
      capexType,
      status: statusFilter,
      huCodes,
    }),
    [selectedArchetypeId, capexType, statusFilter, huCodes],
  );

  const filtersKey = useMemo(() => buildFiltersKey(filters), [filters]);
  const sortKey = `${sortBy}:${sortDir}`;

  const getLegacyBundle = useCallback(
    () =>
      queryClient.ensureQueryData({
        queryKey: queryKeys.executiveSummary.bundle(periodName, userId),
        queryFn: () => fetchExecutiveSummaryBundle(periodName, userId),
        staleTime: STALE_TIME_MS,
      }),
    [queryClient, periodName, userId],
  );

  const metaQuery = useQuery({
    queryKey: queryKeys.executiveSummary.meta(periodName, userId),
    queryFn: async () => {
      if (isBackendConfigured()) {
        const meta = await fetchExecutiveSummaryPageMetaFromBackend(periodName, userId);
        if (meta) return meta;
      }
      const legacy = await getLegacyBundle();
      return {
        periodName,
        periodMeta: legacy.budgetData
          ? {
              periodName: legacy.budgetData.periodName,
              startDate: legacy.budgetData.startDate,
              endDate: legacy.budgetData.endDate,
              multiYearName: legacy.budgetData.multiYearName,
            }
          : null,
        hospitalUnits: [],
        archetypes: [],
      };
    },
    enabled: Boolean(periodName),
    staleTime: STALE_TIME_MS,
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.executiveSummary.stats(periodName, userId, filtersKey, debouncedSearch),
    queryFn: async () => {
      if (isBackendConfigured()) {
        const stats = await fetchExecutiveSummaryStatsFromBackend(periodName, userId, {
          periodName,
          userId,
          search: debouncedSearch,
          ...filters,
        });
        if (stats) return withPulseFallback(stats);
      }
      const legacy = await getLegacyBundle();
      const vm = buildExecutiveSummaryViewModel(legacy.budgetData, filters);
      const pulse = buildPulseFromProjects(vm.filteredProjects);
      return {
        totalProjectsInPeriod: vm.allProjects.length,
        filteredCount: vm.filteredProjects.length,
        activeHuCount: vm.activeHuCount,
        totalRevenue: vm.revenueMn,
        totalAssetImpact: vm.assetImpact,
        pulse,
        buckets: {
          preCon: {
            count: vm.buckets.preCon.length,
            items: buildPlanningBudgetScoringItems(vm.buckets.preCon),
          },
          inCon: { count: vm.buckets.inCon.length, items: vm.buckets.inCon.map(toPreview) },
          postCon: { count: vm.buckets.postCon.length, items: vm.buckets.postCon.map(toPreview) },
          attention: { count: vm.buckets.attention.length, items: vm.buckets.attention.map(toPreview) },
        },
      };
    },
    enabled: Boolean(periodName),
    staleTime: STALE_TIME_MS,
    placeholderData: (prev) => prev,
  });

  const projectsQuery = useInfiniteQuery({
    queryKey: queryKeys.executiveSummary.projects(periodName, userId, filtersKey, debouncedSearch, sortKey),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      if (isBackendConfigured()) {
        const result = await fetchExecutiveSummaryProjectsPageFromBackend({
          periodName,
          userId,
          page,
          pageSize: EXECUTIVE_TABLE_PAGE_SIZE,
          search: debouncedSearch,
          sortBy,
          sortDir,
          ...filters,
        });
        if (result) return result;
      }
      const legacy = await getLegacyBundle();
      const vm = buildExecutiveSummaryViewModel(legacy.budgetData, filters);
      const sorted = sortLegacyProjects(vm.filteredProjects, sortBy, sortDir);
      const filtered = debouncedSearch
        ? sorted.filter((p) =>
            `${p.projectName} ${p.huCode}`.toLowerCase().includes(debouncedSearch.toLowerCase()),
          )
        : sorted;
      const from = (page - 1) * EXECUTIVE_TABLE_PAGE_SIZE;
      const slice = filtered.slice(from, from + EXECUTIVE_TABLE_PAGE_SIZE);
      return {
        rows: slice.map(legacyRowToServerRow),
        page,
        pageSize: EXECUTIVE_TABLE_PAGE_SIZE,
        totalCount: filtered.length,
        hasMore: from + slice.length < filtered.length,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: Boolean(periodName),
    staleTime: STALE_TIME_MS,
  });

  const unitOptions = useMemo(
    () => visibleUnitsFromArchetypes(visibleArchetypes, selectedArchetypeId),
    [visibleArchetypes, selectedArchetypeId],
  );

  const toggleHuCode = useCallback((code: string) => {
    if (!code) {
      setHuCodes([]);
      return;
    }
    setHuCodes((prev) => {
      const set = new Set(prev);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return [...set];
    });
  }, []);

  const periodHeader: ExecutiveSummaryPeriodForHeader = useMemo(
    () => mapPeriodHeaderFromMeta(metaQuery.data?.periodMeta),
    [metaQuery.data?.periodMeta],
  );

  const statusLists = useMemo(
    () => buildStatusListsFromStats(statsQuery.data),
    [statsQuery.data],
  );

  const tableRows = useMemo(
    () => projectsQuery.data?.pages.flatMap((p) => p.rows) ?? [],
    [projectsQuery.data?.pages],
  );

  const totalCount = projectsQuery.data?.pages[0]?.totalCount ?? 0;

  const isLoading = Boolean(periodName) && (metaQuery.isPending || statsQuery.isPending);
  const isTableLoading = projectsQuery.isPending && tableRows.length === 0;
  const isFetchingMore = projectsQuery.isFetchingNextPage;

  const errorMessage =
    metaQuery.isError || statsQuery.isError
      ? metaQuery.error instanceof Error
        ? metaQuery.error.message
        : statsQuery.error instanceof Error
          ? statsQuery.error.message
          : 'Failed to load executive summary.'
      : null;

  return {
    periodHeader,
    stats: statsQuery.data,
    statusLists,
    tableRows,
    totalCount,
    unitOptions,
    filters,
    search,
    setSearch,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    setCapexType,
    setStatusFilter,
    toggleHuCode,
    fetchNextPage: projectsQuery.fetchNextPage,
    hasNextPage: projectsQuery.hasNextPage ?? false,
    isLoading,
    isTableLoading,
    isFetchingMore,
    isTableError: projectsQuery.isError,
    isEmptyPeriod:
      Boolean(periodName) &&
      !isLoading &&
      !errorMessage &&
      !metaQuery.data?.periodMeta &&
      !statsQuery.data?.filteredCount,
    errorMessage,
    hasPeriod: Boolean(periodName),
  };
}

function withPulseFallback(stats: ExecutiveSummaryStats): ExecutiveSummaryStats {
  return {
    ...stats,
    pulse: stats.pulse ?? EMPTY_EXECUTIVE_PULSE,
  };
}

function toPreview(p: {
  id: string;
  huCode: string;
  projectName: string;
  taskToDo: string;
  completionRate: number;
  status: number;
}) {
  return {
    id: p.id,
    huCode: p.huCode,
    projectName: p.projectName,
    taskToDo: p.taskToDo || null,
    completionRate: p.completionRate,
    status: p.status,
  };
}

function sortLegacyProjects<T extends { projectName: string; completionRate: number; revenueProjection: number; status: number; targetStart: string; endDate: string }>(
  rows: T[],
  sortBy: ProjectSortField,
  sortDir: SortDir,
): T[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = fieldValue(a, sortBy);
    const bv = fieldValue(b, sortBy);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function fieldValue(
  row: { projectName: string; completionRate: number; revenueProjection: number; status: number; targetStart: string; endDate: string },
  sortBy: ProjectSortField,
): string | number {
  switch (sortBy) {
    case 'completion_rate':
      return row.completionRate;
    case 'revenue_projection':
      return row.revenueProjection;
    case 'status':
      return row.status;
    case 'target_start':
      return row.targetStart || '';
    case 'end_date':
      return row.endDate || '';
    default:
      return row.projectName.toLowerCase();
  }
}

function legacyRowToServerRow(p: EnrichedExecutiveProject) {
  const isPipeline = Boolean(p.isPipelineProject);
  const type = String(p.type ?? '');
  const segment =
    isPipeline || type === 'Project Pipeline' ? 'Pipeline' : type === 'Strategic Projects' ? 'Strategic' : 'General';
  return {
    id: p.id,
    projectName: p.projectName,
    projectCode: p.projectCode,
    huCode: p.huCode,
    huName: p.huName,
    archetypeName: p.archetypeName,
    segment,
    assetCount: p.assets?.length ?? 0,
    status: p.status,
    completionRate: p.completionRate,
    revenueProjection: p.revenueProjection,
    targetStart: p.targetStart || null,
    endDate: p.endDate || null,
    taskToDo: p.taskToDo || null,
    owner: p.owner || '',
    approvedBudget: Number(p.approvedBudget ?? 0),
    isPipelineProject: isPipeline,
    type,
  };
}
