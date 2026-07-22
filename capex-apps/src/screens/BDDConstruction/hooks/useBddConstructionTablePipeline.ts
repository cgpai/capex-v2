import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EnrichedAsset, User } from '../../../types';
import { useBeBffProxy } from '../../../lib/capexBeClient';
import { getAccessTokenForBackend } from '../../../lib/authSession';
import { useBackendSession } from '../../../lib/auth/authConstants';
import {
  isProjectListUnauthorizedError,
} from '../../../services/capexProjectListApi';
import { normAssetKey } from '../../../lib/assetKeys';
import {
  buildProjectListServerFilters,
  isDefaultProjectListServerFilters,
} from '../../../services/projectListQueryTypes';
import { fetchBddConstructionQueryPage } from '../../../hooks/queries/fetchBddConstructionQuery';
import {
  bddConstructionFiltersCacheKey,
  readBddConstructionTableCacheAnyAge,
  writeBddConstructionTableCache,
  type BddConstructionTableBundle,
} from '../../../lib/bddConstructionDiskCache';
import { queryKeys } from '../../../lib/query-keys';
import * as configService from '../../../services/configService';
import {
  buildBddFilterMaps,
  filterBddConstructionAssets,
  type BddRoleFlags,
} from '../listUtils';
import type { BddMeetingFilters } from './useBddConstructionFilterState';
import type { UserScopesForCapex } from '../../../lib/capexProjectListScope';

export const BDD_KANBAN_PAGE_SIZE = 100;

export type BddTablePipelineConfig = {
  currentUser: User;
  effectivePeriodName: string;
  permissions: { userScopes: UserScopesForCapex };
  roleFlags: BddRoleFlags;
  isSuperAdmin: boolean;
  hasBDDRole: boolean;
  debouncedSearch: string;
  debouncedCompletionRange: { min: number; max: number };
  selectedHUs: string[];
  selectedPriorities: string[];
  meetingFilters: BddMeetingFilters;
  isSearchStaging: boolean;
  viewMode: 'kanban' | 'list';
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  itemsPerPage: number;
  preloadedSnapshot?: BddConstructionTableBundle | null;
  showToastRef: MutableRefObject<(message: string, type?: 'success' | 'error') => void>;
  setSelectedAsset: Dispatch<SetStateAction<EnrichedAsset | null>>;
};

export type BddTablePipeline = {
  tableQuery: UseQueryResult<BddConstructionTableBundle | null, Error>;
  tableQueryKey: readonly unknown[];
  allAssets: EnrichedAsset[];
  allProjects: BddConstructionTableBundle['projects'];
  priorities: BddConstructionTableBundle['priorities'];
  assetTags: BddConstructionTableBundle['tags'];
  allWorkflows: BddConstructionTableBundle['workflows'];
  allTasks: BddConstructionTableBundle['allTasks'];
  masterData: { hus: BddConstructionTableBundle['hus'] };
  listTotalAssetCount: number | null;
  filterMaps: ReturnType<typeof buildBddFilterMaps>;
  filteredAssets: EnrichedAsset[];
  assetLastUpdateTaskMap: Map<string, { taskName: string; completedAt?: string }>;
  hasListData: boolean;
  showBlockingSkeleton: boolean;
  isBackgroundRefetch: boolean;
  isFilterRefreshing: boolean;
  clearTableForRefetch: () => void;
  mustRefetchTableRef: MutableRefObject<boolean>;
};

export function useBddConstructionTablePipeline({
  currentUser,
  effectivePeriodName,
  permissions,
  roleFlags,
  isSuperAdmin,
  hasBDDRole,
  debouncedSearch,
  debouncedCompletionRange,
  selectedHUs,
  selectedPriorities,
  meetingFilters,
  isSearchStaging,
  viewMode,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  preloadedSnapshot,
  showToastRef,
  setSelectedAsset,
}: BddTablePipelineConfig): BddTablePipeline {
  const lastAppliedBundleRef = useRef<BddConstructionTableBundle | null>(null);
  const mustRefetchTableRef = useRef(false);
  const filtersKeyWithoutPageRef = useRef('');

  const effectivePageSize = viewMode === 'kanban' ? BDD_KANBAN_PAGE_SIZE : itemsPerPage;
  const effectivePage = viewMode === 'kanban' ? 1 : currentPage;

  const serverFilters = useMemo(
    () =>
      buildProjectListServerFilters({
        searchTerm: debouncedSearch,
        selectedHUs,
        meetingFilters,
        selectedPriorities,
        selectedBudgetCategoryIds: [],
        selectedBudgetFilter: null,
        selectedFinishedTasks: [],
        completionRange: debouncedCompletionRange,
        userScopes: permissions.userScopes,
        bddConstructionOnly: true,
        hideUnassignedBdd: !isSuperAdmin && !hasBDDRole,
      }),
    [
      debouncedSearch,
      selectedHUs.join('\u0001'),
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      selectedPriorities.join('\u0001'),
      debouncedCompletionRange.min,
      debouncedCompletionRange.max,
      permissions.userScopes,
      isSuperAdmin,
      hasBDDRole,
    ],
  );

  const filtersKey = useMemo(() => {
    if (!effectivePeriodName) return '';
    return bddConstructionFiltersCacheKey({
      periodName: effectivePeriodName,
      userId: currentUser.id,
      page: effectivePage,
      pageSize: effectivePageSize,
      ...serverFilters,
    });
  }, [currentUser.id, effectivePeriodName, serverFilters, effectivePage, effectivePageSize]);

  const listFiltersKey = useMemo(() => {
    if (!effectivePeriodName) return '';
    return bddConstructionFiltersCacheKey({
      periodName: effectivePeriodName,
      userId: currentUser.id,
      page: 1,
      pageSize: itemsPerPage,
      ...serverFilters,
    });
  }, [currentUser.id, effectivePeriodName, serverFilters, itemsPerPage]);

  const [diskTableSeed, setDiskTableSeed] = useState<BddConstructionTableBundle | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    if (mustRefetchTableRef.current || !effectivePeriodName || !filtersKey) {
      setDiskTableSeed(undefined);
      return;
    }
    setDiskTableSeed(
      readBddConstructionTableCacheAnyAge(
        effectivePeriodName,
        currentUser.id,
        filtersKey,
        effectivePage,
        effectivePageSize,
      ) ?? undefined,
    );
  }, [currentUser.id, effectivePeriodName, filtersKey, effectivePage, effectivePageSize]);

  const tableQueryKey = useMemo(
    () =>
      queryKeys.bddConstruction.table(
        effectivePeriodName,
        currentUser.id,
        filtersKey,
        effectivePage,
        effectivePageSize,
      ),
    [effectivePeriodName, currentUser.id, filtersKey, effectivePage, effectivePageSize],
  );

  const clearTableForRefetch = useCallback(() => {
    lastAppliedBundleRef.current = null;
    mustRefetchTableRef.current = true;
    setSelectedAsset(null);
  }, [setSelectedAsset]);

  useLayoutEffect(() => {
    if (listFiltersKey && filtersKeyWithoutPageRef.current !== listFiltersKey) {
      const hadPriorKey = filtersKeyWithoutPageRef.current !== '';
      filtersKeyWithoutPageRef.current = listFiltersKey;
      lastAppliedBundleRef.current = null;
      setCurrentPage(1);
      if (hadPriorKey) clearTableForRefetch();
    }
  }, [listFiltersKey, clearTableForRefetch, setCurrentPage]);

  const capexBeUrl =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim() ?? '' : '';

  const tableQuery = useQuery<BddConstructionTableBundle | null>({
    queryKey: tableQueryKey,
    enabled: Boolean(effectivePeriodName && capexBeUrl),
    retry: (failureCount, err) => !isProjectListUnauthorizedError(err) && failureCount < 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev ?? diskTableSeed ?? undefined,
    initialData: diskTableSeed,
    queryFn: async ({ signal }) => {
      const bff = useBeBffProxy();
      let token: string | null = null;
      if (!bff || !useBackendSession()) {
        token = await getAccessTokenForBackend();
        if (!bff && !token) {
          throw new Error('Sesi tidak valid — login ulang untuk memuat data BDD dari server.');
        }
      }
      try {
        const result = await fetchBddConstructionQueryPage(
          {
            periodName: effectivePeriodName,
            userId: currentUser.id,
            page: effectivePage,
            pageSize: effectivePageSize,
            skipCache: true,
            ...serverFilters,
          },
          token,
        );
        if (signal.aborted) return null;
        mustRefetchTableRef.current = false;
        return result;
      } catch (beErr) {
        if (signal.aborted) throw beErr;
        throw beErr;
      }
    },
  });

  const isDefaultFilters = isDefaultProjectListServerFilters(serverFilters);
  const resolvedBundle =
    tableQuery.data ??
    diskTableSeed ??
    (isDefaultFilters ? preloadedSnapshot : null) ??
    null;

  const allAssets = resolvedBundle?.enrichedAssets ?? [];
  const allProjects = resolvedBundle?.projects ?? [];
  const priorities = resolvedBundle?.priorities ?? [];
  const assetTags = resolvedBundle?.tags ?? [];
  const allWorkflows = resolvedBundle?.workflows ?? [];
  const allTasks = resolvedBundle?.allTasks ?? [];
  const masterData = { hus: resolvedBundle?.hus ?? [] };
  const listTotalAssetCount =
    typeof resolvedBundle?.totalAssetCount === 'number' ? resolvedBundle.totalAssetCount : null;

  const assetLastUpdateTaskMap = useMemo(() => {
    const map = new Map<string, { taskName: string; completedAt?: string }>();
    if (resolvedBundle?.assetLastTaskMap) {
      Object.entries(resolvedBundle.assetLastTaskMap).forEach(([k, v]) => {
        map.set(normAssetKey(k), { taskName: v });
      });
    }
    return map;
  }, [resolvedBundle?.assetLastTaskMap]);

  useEffect(() => {
    if (!tableQuery.isSuccess || !tableQuery.data || !effectivePeriodName || !filtersKey) return;
    lastAppliedBundleRef.current = tableQuery.data;
    writeBddConstructionTableCache(
      effectivePeriodName,
      currentUser.id,
      filtersKey,
      effectivePage,
      effectivePageSize,
      tableQuery.data,
    );
  }, [
    tableQuery.isSuccess,
    tableQuery.data,
    effectivePeriodName,
    filtersKey,
    currentUser.id,
    effectivePage,
    effectivePageSize,
  ]);

  useEffect(() => {
    if (!tableQuery.isError) return;
    console.error('Failed to load BDD assets', tableQuery.error);
    showToastRef.current('Failed to load assets', 'error');
  }, [tableQuery.isError, tableQuery.error, showToastRef]);

  const filterMaps = useMemo(
    () => buildBddFilterMaps(allProjects, priorities, masterData.hus),
    [allProjects, priorities, masterData.hus],
  );

  const filteredAssets = useMemo(
    () =>
      filterBddConstructionAssets(
        allAssets,
        filterMaps,
        {
          searchLower: debouncedSearch.trim().toLowerCase(),
          selectedHUs,
          selectedPriorities,
          completionRange: debouncedCompletionRange,
          meetingFilters,
          periodName: effectivePeriodName,
        },
        roleFlags,
        permissions.userScopes,
      ),
    [
      allAssets,
      filterMaps,
      debouncedSearch,
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      debouncedCompletionRange.min,
      debouncedCompletionRange.max,
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      effectivePeriodName,
      roleFlags,
      permissions.userScopes,
    ],
  );

  const hasListData = allAssets.length > 0;
  const showBlockingSkeleton = tableQuery.isPending && !hasListData;
  const isBackgroundRefetch =
    hasListData && tableQuery.isFetching && !tableQuery.isPending && !isSearchStaging;
  const isFilterRefreshing =
    isSearchStaging || (tableQuery.isFetching && hasListData && !tableQuery.isPending);

  return {
    tableQuery,
    tableQueryKey,
    allAssets,
    allProjects,
    priorities,
    assetTags,
    allWorkflows,
    allTasks,
    masterData,
    listTotalAssetCount,
    filterMaps,
    filteredAssets,
    assetLastUpdateTaskMap,
    hasListData,
    showBlockingSkeleton,
    isBackgroundRefetch,
    isFilterRefreshing,
    clearTableForRefetch,
    mustRefetchTableRef,
  };
}
