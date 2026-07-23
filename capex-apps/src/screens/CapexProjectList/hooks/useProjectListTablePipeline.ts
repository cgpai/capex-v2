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
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { EnrichedAsset, Project, ProjectPriorityConfig, User } from '../../../types';
import {
  isProjectListUnauthorizedError,
  readProjectListCacheAnyAge,
  writeProjectListCache,
  type ProjectListBundle,
} from '../../../services/capexProjectListApi';
import { useBeBffProxy } from '../../../lib/capexBeClient';
import { useBackendSession } from '../../../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../../../lib/authSession';
import { normAssetKey } from '../../../lib/assetKeys';
import {
  type ListSource,
  type UserScopesForCapex,
  isCompleteListSource,
  projectListBundleToListSource,
  scopeListSourceToUser,
  sealCompleteListSource,
} from '../../../lib/capexProjectListScope';
import { projectListFiltersCacheKey } from '../../../hooks/queries/fetchCapexProjectListQuery';
import { fetchMergedProjectListPage } from '../../../services/fetchMergedProjectListPage';
import {
  isCompleteProjectListBundle,
  warmProjectListClientPool,
} from '../../../services/warmProjectListClientPool';
import {
  buildProjectListServerFilters,
  DEFAULT_PROJECT_LIST_SORT,
  isDefaultProjectListServerFilters,
  type ProjectListSortOption,
} from '../../../services/projectListQueryTypes';
import {
  readProjectListTableCacheAnyAge,
  readProjectListTableShellAnyAge,
  writeProjectListTableCache,
  hasProjectListTableOnDisk,
} from '../../../lib/capexProjectListDiskCache';
import { hydrateCapexProjectListTableFromDisk } from '../../../lib/prefetchCapexProjectList';
import {
  logProjectListPipelineStage,
  PROJECT_LIST_DATA_POLICY,
  isStaleProjectListBundle,
} from '../../../lib/projectListPipelineDebug';
import { invalidateAllCapexProjectListDiskCache } from '../../../lib/capexProjectListDiskCache';
import {
  getSessionClientPool,
  setSessionClientPool,
  clearSessionClientPoolsForUser,
} from '../../../lib/capexProjectListSessionPool';
import {
  buildAssetFilterMaps,
  buildClientFilteredProjectListPage,
  buildArchetypeByHuNameFromBundle,
  enrichedAssetsMatchMeetingFilters,
  enrichedAssetsMatchPanelFilters,
  filterEnrichedAssets,
  enrichProjectsForAssets,
  dedupeEnrichedAssetsById,
  filterProjectListBundleByPeriods,
  tagProjectListBundlePeriodNames,
  sortEnrichedAssetsByOption,
  resolvePreloadedTableScope,
  type AssetListFilters,
  type AssetTypeGroupMasterMaps,
  type ClientFilteredProjectListPage,
} from '../listUtils';
import { queryKeys } from '../../../lib/query-keys';
import type { ShowToastOptions, ToastType } from '../../../contexts/ToastContext';
import type { MeetingFilters } from './useProjectListFilterState';

/** Filtered views: cache hits make repeat selections instant. */
export const FILTERED_TABLE_STALE_MS = 90_000;
export const DEFAULT_TABLE_STALE_MS = 5 * 60 * 1000;

/** Server-side pagination only — no background full-period warm (keeps CPL light). */
const CPL_SERVER_PAGE_ONLY = true;

export type ProjectListTablePipelineConfig = {
  queryClient: QueryClient;
  currentUser: User | null;
  userScopesReady: boolean;
  userScopesRef: MutableRefObject<UserScopesForCapex>;
  userScopesReadyRef: MutableRefObject<boolean>;
  listUserScopes: {
    all: boolean;
    hus: Set<string>;
    archetypes: Set<string>;
  };
  permissions: { userScopes: UserScopesForCapex };

  capexBeUrl: string;
  periodName: string;
  effectivePeriods: string[];
  queryPeriodKey: string;
  primaryPeriodName: string;
  isMultiPeriodView: boolean;
  hasPeriodSubsetFilter: boolean;

  appliedSearchTerm: string;
  searchTerm: string;
  isSearchActive: boolean;
  isSearchStaging: boolean;
  panelFiltersKey: string;
  prevPanelFiltersKeyRef: MutableRefObject<string>;
  selectedHUs: string[];
  selectedPriorities: string[];
  selectedFinishedTasks: string[];
  selectedBudgetFilter: string | null;
  selectedBudgetCategoryIds: string[];
  completionRange: { min: number; max: number };
  meetingFilters: MeetingFilters;
  sortBy: ProjectListSortOption;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  itemsPerPage: number;

  assetTypeGroupMaster: AssetTypeGroupMasterMaps;
  archetypeByHuName: Map<string, string>;
  masterPriorities: ProjectPriorityConfig[];

  applyMasterFromSource: (source: ListSource) => void;
  masterDataHydratedRef: MutableRefObject<boolean>;
  showToastRef: MutableRefObject<
    (message: string, type?: ToastType, options?: ShowToastOptions) => void
  >;

  usePreloadedTableRows: boolean;
  activePreloadedProjectList: ProjectListBundle | null;
  resolveInitialPreloadScope: () => ReturnType<typeof resolvePreloadedTableScope>;
};

export type ProjectListTablePipeline = {
  allAssets: EnrichedAsset[];
  setAllAssets: Dispatch<SetStateAction<EnrichedAsset[]>>;
  allProjects: Project[];
  setAllProjects: Dispatch<SetStateAction<Project[]>>;
  assetLastTaskMap: Map<string, string>;
  setAssetLastTaskMap: Dispatch<SetStateAction<Map<string, string>>>;
  tableRowsFiltersKey: string;
  setTableRowsFiltersKey: Dispatch<SetStateAction<string>>;
  listTotalAssetCount: number | null;
  setListTotalAssetCount: Dispatch<SetStateAction<number | null>>;

  tableQuery: UseQueryResult<ProjectListBundle | null>;
  filtersKey: string;
  listFiltersKey: string;
  tableDisplayKey: string;

  clientFilteredPage: ClientFilteredProjectListPage | null;
  clientListFilters: AssetListFilters & { sortBy?: ProjectListSortOption };
  clientFilterCanServe: boolean;
  needsPanelServerFetch: boolean;
  poolReadyForInstantPanelFilters: boolean;

  hasPanelTableFilters: boolean;
  hasActiveTableFilters: boolean;
  hasMeetingSlicers: boolean;
  serverFilters: ReturnType<typeof buildProjectListServerFilters>;
  tableQueryFilters: ReturnType<typeof buildProjectListServerFilters>;
  isDefaultTableView: boolean;

  diskTableSeed: ProjectListBundle | undefined;
  hasListData: boolean;
  hasTableOnDisk: boolean;
  isBackgroundRefresh: boolean;
  isFilterRefreshing: boolean;
  isPageTransition: boolean;

  sourceDataRef: MutableRefObject<ListSource | null>;
  clientFilterPoolRef: MutableRefObject<{ periodKey: string; source: ListSource } | null>;
  clientPoolRevision: number;
  setClientPoolRevision: Dispatch<SetStateAction<number>>;

  persistCompleteClientPool: (periodKey: string, source: ListSource) => void;
  activateClientPoolFromCache: (periodKey: string) => boolean;
  mustRefetchTableRef: MutableRefObject<boolean>;

  clearTableRows: (opts?: { keepTotal?: boolean }) => void;
  resetTableForFilterChange: () => void;
  resetAppliedTableCacheKeys: () => void;
  setClientFilterPoolReady: Dispatch<SetStateAction<boolean>>;
  resetTablePipelineForPeriodChange: () => void;
  applyTableBundle: (
    bundle: ProjectListBundle,
    opts?: { hydrateMaster?: boolean; trustServerFilters?: boolean },
  ) => void;
};

export function useProjectListTablePipeline(
  config: ProjectListTablePipelineConfig,
): ProjectListTablePipeline {
  const {
    queryClient,
    currentUser,
    userScopesReady,
    userScopesRef,
    userScopesReadyRef,
    listUserScopes,
    permissions,
    capexBeUrl,
    effectivePeriods,
    queryPeriodKey,
    primaryPeriodName,
    isMultiPeriodView,
    hasPeriodSubsetFilter,
    appliedSearchTerm,
    searchTerm,
    isSearchActive,
    isSearchStaging,
    panelFiltersKey,
    prevPanelFiltersKeyRef,
    selectedHUs,
    selectedPriorities,
    selectedFinishedTasks,
    selectedBudgetFilter,
    selectedBudgetCategoryIds,
    completionRange,
    meetingFilters,
    sortBy,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    assetTypeGroupMaster,
    archetypeByHuName,
    masterPriorities,
    applyMasterFromSource,
    masterDataHydratedRef,
    showToastRef,
    usePreloadedTableRows,
    activePreloadedProjectList,
    resolveInitialPreloadScope,
  } = config;

  const projectListBeFallbackNoticeShownRef = useRef(false);
  const pipelineDiskPurgedRef = useRef(false);
  const lastAppliedBundleRef = useRef<ProjectListBundle | null>(null);
  const lastAppliedFiltersKeyRef = useRef('');
  const lastAppliedRowIdsRef = useRef('');
  const clientFilterPoolRef = useRef<{ periodKey: string; source: ListSource } | null>(null);
  const clientFilterPoolByPeriodRef = useRef<Map<string, ListSource>>(new Map());
  const [clientFilterPoolReady, setClientFilterPoolReady] = useState(false);
  const [clientPoolWarmFailed, setClientPoolWarmFailed] = useState(false);
  const [clientPoolRevision, setClientPoolRevision] = useState(0);

  const persistCompleteClientPool = useCallback(
    (periodKey: string, source: ListSource) => {
      if (!periodKey) return;
      const scoped = sealCompleteListSource(
        scopeListSourceToUser(source, userScopesRef.current, {
          ready: userScopesReadyRef.current,
        }),
      );
      if (!isCompleteListSource(scoped)) return;
      clientFilterPoolByPeriodRef.current.set(periodKey, scoped);
      if (currentUser?.id) {
        setSessionClientPool(currentUser.id, periodKey, scoped);
      }
    },
    [currentUser?.id, userScopesRef, userScopesReadyRef],
  );

  const activateClientPoolFromCache = useCallback((periodKey: string): boolean => {
    if (CPL_SERVER_PAGE_ONLY || !periodKey) return false;
    const cached = clientFilterPoolByPeriodRef.current.get(periodKey);
    if (!cached || !isCompleteListSource(cached)) return false;
    clientFilterPoolRef.current = { periodKey, source: cached };
    return true;
  }, []);

  const preloadTableAppliedRef = useRef(false);

  const [allAssets, setAllAssets] = useState<EnrichedAsset[]>(() => {
    const scope = resolvePreloadedTableScope(
      usePreloadedTableRows,
      activePreloadedProjectList,
      currentUser,
      permissions.userScopes,
      userScopesReady,
    );
    if (scope) preloadTableAppliedRef.current = true;
    return scope?.assets ?? [];
  });
  const [allProjects, setAllProjects] = useState<Project[]>(() => {
    const scope = resolvePreloadedTableScope(
      usePreloadedTableRows,
      activePreloadedProjectList,
      currentUser,
      permissions.userScopes,
      userScopesReady,
    );
    return scope?.projects ?? [];
  });
  const [assetLastTaskMap, setAssetLastTaskMap] = useState<Map<string, string>>(() => {
    const scope = resolvePreloadedTableScope(
      usePreloadedTableRows,
      activePreloadedProjectList,
      currentUser,
      permissions.userScopes,
      userScopesReady,
    );
    return scope ? new Map(scope.lastMap) : new Map();
  });
  const [tableRowsFiltersKey, setTableRowsFiltersKey] = useState('');

  const [listTotalAssetCount, setListTotalAssetCount] = useState<number | null>(() =>
    usePreloadedTableRows && typeof activePreloadedProjectList?.totalAssetCount === 'number'
      ? activePreloadedProjectList.totalAssetCount
      : null,
  );

  useLayoutEffect(() => {
    if (preloadTableAppliedRef.current) return;
    const scope = resolveInitialPreloadScope();
    if (!scope) return;
    preloadTableAppliedRef.current = true;
    setAllAssets(scope.assets);
    setAllProjects(scope.projects);
    setAssetLastTaskMap(new Map(scope.lastMap));
    if (typeof activePreloadedProjectList?.totalAssetCount === 'number') {
      setListTotalAssetCount(activePreloadedProjectList.totalAssetCount);
    }
  }, [resolveInitialPreloadScope, activePreloadedProjectList?.totalAssetCount]);

  const sourceDataRef = useRef<ListSource | null>(null);

  const restoreClientPoolFromSession = useCallback(
    (periodKey: string): boolean => {
      if (CPL_SERVER_PAGE_ONLY) return false;
      if (!currentUser?.id || !periodKey.trim() || effectivePeriods.length > 1) return false;
      const active = clientFilterPoolRef.current;
      if (
        active?.periodKey === periodKey &&
        isCompleteListSource(active.source)
      ) {
        if (!clientFilterPoolReady) setClientFilterPoolReady(true);
        return true;
      }
      const session = getSessionClientPool(currentUser.id, periodKey);
      if (!session || !isCompleteListSource(session)) return false;
      clientFilterPoolRef.current = { periodKey, source: session };
      clientFilterPoolByPeriodRef.current.set(periodKey, session);
      sourceDataRef.current = session;
      setClientFilterPoolReady(true);
      setClientPoolRevision((n) => n + 1);
      return true;
    },
    [currentUser?.id, effectivePeriods.length, clientFilterPoolReady],
  );

  const hasMeetingSlicers = Boolean(meetingFilters.archetype || meetingFilters.assetTypeGroup);

  const hasProgressPanelFilters = useMemo(
    () =>
      selectedFinishedTasks.length > 0 ||
      completionRange.min > 0 ||
      completionRange.max < 100,
    [
      selectedFinishedTasks.join('\u0001'),
      completionRange.min,
      completionRange.max,
    ],
  );

  const hasPanelTableFilters = useMemo(
    () =>
      hasPeriodSubsetFilter ||
      isSearchActive ||
      selectedHUs.length > 0 ||
      selectedPriorities.length > 0 ||
      selectedFinishedTasks.length > 0 ||
      selectedBudgetFilter != null ||
      selectedBudgetCategoryIds.length > 0 ||
      completionRange.min > 0 ||
      completionRange.max < 100,
    [
      hasPeriodSubsetFilter,
      isSearchActive,
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      selectedFinishedTasks.join('\u0001'),
      selectedBudgetFilter,
      selectedBudgetCategoryIds.join('\u0001'),
      completionRange.min,
      completionRange.max,
    ],
  );

  const hasActiveTableFilters = hasPanelTableFilters || hasMeetingSlicers;

  const serverFilters = useMemo(
    () =>
      buildProjectListServerFilters({
        searchTerm: appliedSearchTerm,
        selectedHUs,
        meetingFilters,
        selectedPriorities,
        selectedBudgetCategoryIds,
        selectedBudgetFilter,
        selectedFinishedTasks,
        completionRange,
        userScopes: userScopesReady
          ? listUserScopes
          : { all: false, hus: new Set<string>(), archetypes: new Set<string>() },
        sortBy,
      }),
    [
      userScopesReady,
      listUserScopes,
      appliedSearchTerm,
      selectedHUs.join('\u0001'),
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      selectedPriorities.join('\u0001'),
      selectedBudgetCategoryIds.join('\u0001'),
      selectedBudgetFilter,
      selectedFinishedTasks.join('\u0001'),
      completionRange.min,
      completionRange.max,
      sortBy,
    ],
  );

  const poolReadyForInstantPanelFilters = useMemo(() => {
    const pool = clientFilterPoolRef.current;
    return (
      clientFilterPoolReady &&
      !isMultiPeriodView &&
      pool?.periodKey === queryPeriodKey &&
      isCompleteListSource(pool?.source)
    );
  }, [clientFilterPoolReady, isMultiPeriodView, queryPeriodKey, clientPoolRevision]);

  /**
   * Multi-period, network/asset-group, progress, and search → server (authoritative).
   * Single-period HU/priority/budget only → client pool when warm.
   */
  const needsPanelServerFetch = useMemo(
    () =>
      isMultiPeriodView ||
      hasMeetingSlicers ||
      hasProgressPanelFilters ||
      isSearchActive ||
      !poolReadyForInstantPanelFilters,
    [
      isMultiPeriodView,
      hasMeetingSlicers,
      hasProgressPanelFilters,
      isSearchActive,
      poolReadyForInstantPanelFilters,
    ],
  );

  const tableQueryFilters = serverFilters;

  const isDefaultTableView = useMemo(
    () => isDefaultProjectListServerFilters(tableQueryFilters),
    [tableQueryFilters],
  );

  const listFiltersKey = useMemo(() => {
    if (!currentUser || !queryPeriodKey) return '';
    return projectListFiltersCacheKey({
      periodName: queryPeriodKey,
      userId: currentUser.id,
      page: 1,
      pageSize: itemsPerPage,
      ...tableQueryFilters,
    });
  }, [currentUser?.id, queryPeriodKey, tableQueryFilters, itemsPerPage]);

  /** Filter-only key (page stripped by projectListFiltersCacheKey). */
  const filtersKey = listFiltersKey;

  /** Per-page display key — serverTableReady must match current page. */
  const tableDisplayKey = useMemo(() => {
    if (!listFiltersKey) return '';
    return `${listFiltersKey}\u0004${currentPage}\u0004${itemsPerPage}`;
  }, [listFiltersKey, currentPage, itemsPerPage]);

  const mustRefetchTableRef = useRef(false);
  const hadActiveFiltersOnMountRef = useRef(hasActiveTableFilters);
  const mountFilterClearAppliedRef = useRef(false);

  const tryResolveTableBundleFromCache = useCallback(
    (page: number, pageSize: number, key: string): ProjectListBundle | null => {
      if (!currentUser || !key) return null;
      const queryCached = queryClient.getQueryData<ProjectListBundle | null>(
        queryKeys.capexProjectList.table(queryPeriodKey, currentUser.id, key, page, pageSize),
      );
      if (queryCached && !isStaleProjectListBundle(queryCached.totalAssetCount, queryCached._debug)) {
        return queryCached;
      }
      if (isMultiPeriodView || !primaryPeriodName.trim()) return null;
      const diskExact = readProjectListTableCacheAnyAge(
        primaryPeriodName,
        currentUser.id,
        key,
        page,
        pageSize,
      );
      if (diskExact && !isStaleProjectListBundle(diskExact.totalAssetCount, diskExact._debug)) {
        queryClient.setQueryData(
          queryKeys.capexProjectList.table(queryPeriodKey, currentUser.id, key, page, pageSize),
          diskExact,
        );
        return diskExact;
      }
      if (!isDefaultTableView) return null;
      const shell = readProjectListTableShellAnyAge(primaryPeriodName, currentUser.id, key);
      if (shell && !isStaleProjectListBundle(shell.totalAssetCount, shell._debug)) {
        return shell;
      }
      return null;
    },
    [currentUser, queryPeriodKey, primaryPeriodName, isMultiPeriodView, isDefaultTableView, queryClient],
  );

  const bundleRowsCacheKey = useCallback((assets: EnrichedAsset[]) => {
    return assets.map((a) => normAssetKey(a.id)).join('\u0001');
  }, []);

  const applyTableRowsOnly = useCallback(
    (scopedBundle: ProjectListBundle, source: ListSource, rowCacheKey: string) => {
      if (
        lastAppliedFiltersKeyRef.current === tableDisplayKey &&
        lastAppliedRowIdsRef.current === rowCacheKey
      ) {
        return;
      }
      lastAppliedRowIdsRef.current = rowCacheKey;
      if (typeof scopedBundle.totalAssetCount === 'number') {
        setListTotalAssetCount(scopedBundle.totalAssetCount);
      }
      setAllProjects(enrichProjectsForAssets(source.assets, source.projects));
      setAllAssets(source.assets);
      setAssetLastTaskMap((prev) => {
        const next = new Map(prev);
        Object.entries(source.assetLastTaskMap).forEach(([k, v]) => {
          next.set(normAssetKey(k), v);
        });
        return next;
      });
      if (sourceDataRef.current) {
        sourceDataRef.current = {
          ...sourceDataRef.current,
          assets: source.assets,
          projects: source.projects,
          assetLastTaskMap: { ...sourceDataRef.current.assetLastTaskMap, ...source.assetLastTaskMap },
          totalAssetCount: scopedBundle.totalAssetCount,
        };
      } else {
        sourceDataRef.current = source;
      }
      lastAppliedFiltersKeyRef.current = tableDisplayKey;
      setTableRowsFiltersKey(tableDisplayKey);
    },
    [tableDisplayKey],
  );

  const filtersKeyWithoutPageRef = useRef(listFiltersKey);

  const clientFilterArchetypeByHuName = useMemo(() => {
    const pool = clientFilterPoolRef.current;
    if (
      pool?.periodKey === queryPeriodKey &&
      (pool.source.archetypes?.length ?? 0) > 0 &&
      (pool.source.hus?.length ?? 0) > 0
    ) {
      return buildArchetypeByHuNameFromBundle(pool.source.archetypes, pool.source.hus);
    }
    return archetypeByHuName;
  }, [queryPeriodKey, clientPoolRevision, archetypeByHuName]);

  const bundleMatchesMeetingSlicers = useCallback(
    (bundle: ProjectListBundle) => {
      if (!meetingFilters.archetype && !meetingFilters.assetTypeGroup) return true;
      const assets = dedupeEnrichedAssetsById(bundle.enrichedAssets);
      if (assets.length === 0) return true;
      const bundleArchetypeByHu =
        (bundle.archetypes?.length ?? 0) > 0 && (bundle.hus?.length ?? 0) > 0
          ? buildArchetypeByHuNameFromBundle(bundle.archetypes, bundle.hus)
          : archetypeByHuName;
      return enrichedAssetsMatchMeetingFilters(
        assets,
        meetingFilters,
        assetTypeGroupMaster,
        bundleArchetypeByHu,
      );
    },
    [
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      assetTypeGroupMaster,
      archetypeByHuName,
    ],
  );

  const bundleMatchesPanelSlicers = useCallback(
    (bundle: ProjectListBundle) => {
      if (!hasPanelTableFilters) return true;
      const assets = dedupeEnrichedAssetsById(bundle.enrichedAssets);
      if (assets.length === 0) return true;
      const maps = buildAssetFilterMaps(
        bundle.projects,
        (bundle.priorities?.length ?? 0) > 0 ? bundle.priorities : masterPriorities,
        assets,
      );
      const lastMap = new Map(
        Object.entries(bundle.assetLastTaskMap ?? {}).map(
          ([k, v]) => [normAssetKey(k), v] as [string, string],
        ),
      );
      return enrichedAssetsMatchPanelFilters(
        assets,
        {
          selectedHUs,
          selectedPriorities,
          selectedFinishedTasks,
          selectedBudgetFilter,
          selectedBudgetCategoryIds,
          completionRange,
          searchLower: appliedSearchTerm.trim().toLowerCase(),
        },
        maps,
        lastMap,
        { archetypeByHuName },
      );
    },
    [
      hasPanelTableFilters,
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      selectedFinishedTasks.join('\u0001'),
      selectedBudgetFilter,
      selectedBudgetCategoryIds.join('\u0001'),
      completionRange.min,
      completionRange.max,
      appliedSearchTerm,
      archetypeByHuName,
      masterPriorities,
    ],
  );

  const bundleMatchesTableFilters = useCallback(
    (bundle: ProjectListBundle) =>
      bundleMatchesMeetingSlicers(bundle) && bundleMatchesPanelSlicers(bundle),
    [bundleMatchesMeetingSlicers, bundleMatchesPanelSlicers],
  );

  const applyTableBundle = useCallback(
    (
      bundle: ProjectListBundle,
      opts?: { hydrateMaster?: boolean; trustServerFilters?: boolean },
    ) => {
      if (isStaleProjectListBundle(bundle.totalAssetCount, bundle._debug)) {
        logProjectListPipelineStage('reject-stale-bundle', {
          policy: bundle._debug?.dataPolicy,
          expectedPolicy: PROJECT_LIST_DATA_POLICY,
          totalAssetCount: bundle.totalAssetCount,
          dbTruthCount: bundle._debug?.dbTruthCount,
        });
        return;
      }
      const scopedBundle: ProjectListBundle = filterProjectListBundleByPeriods(
        tagProjectListBundlePeriodNames(
          {
            ...bundle,
            enrichedAssets: dedupeEnrichedAssetsById(bundle.enrichedAssets),
          },
          effectivePeriods,
        ),
        effectivePeriods,
      );
      const rowCacheKey = bundleRowsCacheKey(scopedBundle.enrichedAssets);
      if (
        lastAppliedFiltersKeyRef.current === tableDisplayKey &&
        lastAppliedRowIdsRef.current === rowCacheKey
      ) {
        return;
      }
      if (!opts?.trustServerFilters && !bundleMatchesTableFilters(scopedBundle)) {
        mustRefetchTableRef.current = true;
        return;
      }
      lastAppliedBundleRef.current = scopedBundle;
      if (currentUser && primaryPeriodName && filtersKey && !isMultiPeriodView) {
        writeProjectListTableCache(
          primaryPeriodName,
          currentUser.id,
          filtersKey,
          currentPage,
          itemsPerPage,
          scopedBundle,
          { isDefaultView: isDefaultProjectListServerFilters(serverFilters) },
        );
      }
      const sourceRaw: ListSource = projectListBundleToListSource(scopedBundle);
      const source = scopeListSourceToUser(sourceRaw, userScopesRef.current, {
        ready: userScopesReadyRef.current,
      });
      const displayBundle: ProjectListBundle = {
        ...scopedBundle,
        enrichedAssets: source.assets,
        projects: source.projects,
        assetLastTaskMap: source.assetLastTaskMap,
        totalAssetCount:
          typeof source.totalAssetCount === 'number'
            ? source.totalAssetCount
            : scopedBundle.totalAssetCount,
      };
      const shouldHydrateMaster =
        (opts?.hydrateMaster ?? !masterDataHydratedRef.current) &&
        (source.workflows?.length ?? 0) > 0;
      if (shouldHydrateMaster) {
        applyMasterFromSource(source);
      }
      applyTableRowsOnly(displayBundle, source, rowCacheKey);
    },
    [
      currentUser,
      primaryPeriodName,
      filtersKey,
      currentPage,
      itemsPerPage,
      serverFilters,
      isMultiPeriodView,
      effectivePeriods,
      applyMasterFromSource,
      applyTableRowsOnly,
      bundleRowsCacheKey,
      bundleMatchesTableFilters,
      masterDataHydratedRef,
      userScopesRef,
      userScopesReadyRef,
      tableDisplayKey,
    ],
  );

  const clientFilterCanServe = useMemo(() => {
    if (!clientFilterPoolReady || isMultiPeriodView) return false;
    const pool = clientFilterPoolRef.current;
    if (!pool || pool.periodKey !== queryPeriodKey) return false;
    return isCompleteListSource(pool.source);
  }, [clientFilterPoolReady, isMultiPeriodView, queryPeriodKey, clientPoolRevision]);

  const [diskTableSeed, setDiskTableSeed] = useState<ProjectListBundle | undefined>(undefined);
  const lastDiskTableSeedKeyRef = useRef('');

  useLayoutEffect(() => {
    if (mustRefetchTableRef.current || isMultiPeriodView) {
      lastDiskTableSeedKeyRef.current = '';
      setDiskTableSeed(undefined);
      return;
    }
    if (clientFilterCanServe && !needsPanelServerFetch) {
      lastDiskTableSeedKeyRef.current = '';
      setDiskTableSeed(undefined);
      return;
    }
    if (!currentUser || !primaryPeriodName.trim() || !filtersKey) {
      lastDiskTableSeedKeyRef.current = '';
      setDiskTableSeed(undefined);
      return;
    }
    hydrateCapexProjectListTableFromDisk(
      queryClient,
      primaryPeriodName,
      currentUser.id,
      filtersKey,
      currentPage,
      itemsPerPage,
      { allowShellFallback: isDefaultTableView && !hasPanelTableFilters },
    );
    const cached = tryResolveTableBundleFromCache(currentPage, itemsPerPage, filtersKey) ?? undefined;
    if (cached && hasActiveTableFilters && !bundleMatchesTableFilters(cached)) {
      lastDiskTableSeedKeyRef.current = '';
      setDiskTableSeed(undefined);
      return;
    }
    const seedKey = cached
      ? `${filtersKey}\u0004${currentPage}\u0004${itemsPerPage}\u0004${bundleRowsCacheKey(cached.enrichedAssets)}`
      : '';
    if (seedKey === lastDiskTableSeedKeyRef.current) return;
    lastDiskTableSeedKeyRef.current = seedKey;
    setDiskTableSeed(cached);
  }, [
    currentUser?.id,
    primaryPeriodName,
    filtersKey,
    currentPage,
    itemsPerPage,
    isMultiPeriodView,
    isDefaultTableView,
    hasPanelTableFilters,
    clientFilterCanServe,
    needsPanelServerFetch,
    hasActiveTableFilters,
    queryClient,
    tryResolveTableBundleFromCache,
    bundleMatchesTableFilters,
    bundleRowsCacheKey,
  ]);

  const mayUseDiskSeed =
    !isMultiPeriodView &&
    !mustRefetchTableRef.current &&
    !hasActiveTableFilters &&
    Boolean(diskTableSeed);

  const clientListFilters = useMemo(
    () => ({
      searchLower: appliedSearchTerm.trim().toLowerCase(),
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      selectedBudgetCategoryIds,
      completionRange,
      meetingFilters,
      sortBy,
      allowedPeriods: effectivePeriods,
      strictPeriodFilter: hasPeriodSubsetFilter,
      assetTypeGroupMaps: assetTypeGroupMaster,
      archetypeByHuName: clientFilterArchetypeByHuName,
    }),
    [
      appliedSearchTerm,
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      selectedFinishedTasks.join('\u0001'),
      selectedBudgetFilter,
      selectedBudgetCategoryIds.join('\u0001'),
      completionRange.min,
      completionRange.max,
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      sortBy,
      effectivePeriods.join('\u0001'),
      hasPeriodSubsetFilter,
      assetTypeGroupMaster,
      clientFilterArchetypeByHuName,
    ],
  );

  const clientFilteredPage = useMemo(() => {
    if (isMultiPeriodView || !poolReadyForInstantPanelFilters) return null;
    const pool = clientFilterPoolRef.current;
    if (!pool || pool.periodKey !== queryPeriodKey) return null;
    if (!isCompleteListSource(pool.source)) return null;
    const scopedPool = scopeListSourceToUser(pool.source, permissions.userScopes, {
      ready: userScopesReady,
    });
    return buildClientFilteredProjectListPage(
      scopedPool,
      clientListFilters,
      currentPage,
      itemsPerPage,
    );
  }, [
    isMultiPeriodView,
    poolReadyForInstantPanelFilters,
    queryPeriodKey,
    clientListFilters,
    currentPage,
    itemsPerPage,
    clientPoolRevision,
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    selectedHUs.join('\u0001'),
    userScopesReady,
    permissions.userScopes.all,
    [...permissions.userScopes.hus].sort().join('\u0001'),
    [...permissions.userScopes.archetypes].sort().join('\u0001'),
  ]);

  const clearTableRows = useCallback((opts?: { keepTotal?: boolean }) => {
    setAllAssets([]);
    setAllProjects([]);
    if (!opts?.keepTotal) {
      setListTotalAssetCount(null);
    }
  }, []);

  const resetTableForFilterChange = useCallback(() => {
    setCurrentPage(1);
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    setTableRowsFiltersKey('');
    mustRefetchTableRef.current = true;
    clearTableRows();
  }, [setCurrentPage, clearTableRows]);

  useLayoutEffect(() => {
    if (!hadActiveFiltersOnMountRef.current || mountFilterClearAppliedRef.current) return;
    mountFilterClearAppliedRef.current = true;
    mustRefetchTableRef.current = true;
    clearTableRows();
  }, [clearTableRows]);

  const resetAppliedTableCacheKeys = useCallback(() => {
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    setTableRowsFiltersKey('');
  }, []);

  const resetTablePipelineForPeriodChange = useCallback(() => {
    setCurrentPage(1);
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    mustRefetchTableRef.current = true;
    const outgoing = clientFilterPoolRef.current;
    if (outgoing) {
      persistCompleteClientPool(outgoing.periodKey, outgoing.source);
    }
    clientFilterPoolRef.current = null;
    setClientFilterPoolReady(false);
    setClientPoolWarmFailed(false);
    setTableRowsFiltersKey('');
    clearTableRows();
    if (currentUser?.id) {
      void queryClient.invalidateQueries({
        queryKey: ['screen', 'capex-project-list', 'table'],
      });
    }
  }, [setCurrentPage, persistCompleteClientPool, clearTableRows, currentUser?.id, queryClient]);

  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    if (prevUserIdRef.current && prevUserIdRef.current !== currentUser?.id) {
      clearSessionClientPoolsForUser(prevUserIdRef.current);
    }
    prevUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  useEffect(() => {
    const uid = currentUser?.id;
    return () => {
      const pool = clientFilterPoolRef.current;
      if (uid && pool && isCompleteListSource(pool.source)) {
        setSessionClientPool(uid, pool.periodKey, pool.source);
      }
    };
  }, [currentUser?.id]);

  useLayoutEffect(() => {
    if (!currentUser?.id || !queryPeriodKey || isMultiPeriodView) return;
    const active = clientFilterPoolRef.current;
    if (active?.periodKey === queryPeriodKey && isCompleteListSource(active.source)) {
      if (!clientFilterPoolReady) setClientFilterPoolReady(true);
      return;
    }
    if (restoreClientPoolFromSession(queryPeriodKey)) return;
  }, [
    currentUser?.id,
    queryPeriodKey,
    primaryPeriodName,
    isMultiPeriodView,
    restoreClientPoolFromSession,
    clientFilterPoolReady,
    userScopesRef,
    userScopesReadyRef,
  ]);

  const prevUserScopesReadyRef = useRef(userScopesReady);
  useEffect(() => {
    const becameReady = !prevUserScopesReadyRef.current && userScopesReady;
    prevUserScopesReadyRef.current = userScopesReady;
    if (!becameReady || permissions.userScopes.all) return;
    if (currentUser?.id) clearSessionClientPoolsForUser(currentUser.id);
    clientFilterPoolRef.current = null;
    clientFilterPoolByPeriodRef.current.clear();
    setClientFilterPoolReady(false);
    mustRefetchTableRef.current = true;
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    clearTableRows();
    if (currentUser?.id) {
      void queryClient.invalidateQueries({
        queryKey: ['screen', 'capex-project-list', 'table'],
      });
    }
  }, [userScopesReady, permissions.userScopes.all, currentUser?.id, queryClient, clearTableRows]);

  useEffect(() => {
    if (!currentUser || !primaryPeriodName.trim() || !capexBeUrl || !userScopesReady) {
      return;
    }
    if (isMultiPeriodView) {
      const outgoing = clientFilterPoolRef.current;
      if (outgoing) {
        persistCompleteClientPool(outgoing.periodKey, outgoing.source);
      }
      clientFilterPoolRef.current = null;
      setClientFilterPoolReady(false);
      return;
    }

    const poolKey = queryPeriodKey;
    const active = clientFilterPoolRef.current;
    if (active?.periodKey === poolKey && isCompleteListSource(active.source)) {
      setClientFilterPoolReady(true);
      setClientPoolWarmFailed(false);
      return;
    }
    if (restoreClientPoolFromSession(poolKey)) {
      setClientPoolWarmFailed(false);
      return;
    }
    if (activateClientPoolFromCache(poolKey)) {
      sourceDataRef.current = clientFilterPoolRef.current!.source;
      setClientFilterPoolReady(true);
      setClientPoolRevision((n) => n + 1);
      setClientPoolWarmFailed(false);
      return;
    }

    let cancelled = false;

    const legacyBundle = readProjectListCacheAnyAge(primaryPeriodName, currentUser.id);
    const legacyComplete =
      legacyBundle &&
      legacyBundle.enrichedAssets.length > 0 &&
      isCompleteProjectListBundle(legacyBundle) &&
      !isStaleProjectListBundle(legacyBundle.totalAssetCount, legacyBundle._debug);

    if (legacyComplete && !CPL_SERVER_PAGE_ONLY) {
      const seeded = sealCompleteListSource(projectListBundleToListSource(legacyBundle));
      const scopedSeeded = scopeListSourceToUser(seeded, userScopesRef.current, {
        ready: userScopesReadyRef.current,
      });
      clientFilterPoolRef.current = { periodKey: poolKey, source: scopedSeeded };
      persistCompleteClientPool(poolKey, seeded);
      sourceDataRef.current = scopedSeeded;
      setClientFilterPoolReady(true);
      setClientPoolRevision((n) => n + 1);
      setClientPoolWarmFailed(false);
      return () => {
        cancelled = true;
      };
    }

    if (hasActiveTableFilters || CPL_SERVER_PAGE_ONLY) {
      return;
    }

    clientFilterPoolRef.current = null;
    setClientFilterPoolReady(false);
    setClientPoolWarmFailed(false);

    const abort = new AbortController();
    let idleHandle: number | undefined;
    let deferTimer: ReturnType<typeof setTimeout> | undefined;

    const runWarm = () => {
      if (cancelled || abort.signal.aborted) return;
      void (async () => {
        try {
          const bff = useBeBffProxy();
          let token: string | null = null;
          if (!bff || !useBackendSession()) {
            token = await getAccessTokenForBackend();
            if (!bff && !token) return;
          }
          const defaultFilters = buildProjectListServerFilters({
            searchTerm: '',
            selectedHUs: [],
            meetingFilters: { archetype: null, assetTypeGroup: null },
            selectedPriorities: [],
            selectedBudgetCategoryIds: [],
            selectedBudgetFilter: null,
            selectedFinishedTasks: [],
            completionRange: { min: 0, max: 100 },
            userScopes: userScopesReadyRef.current
              ? {
                  all: userScopesRef.current.all,
                  hus: userScopesRef.current.hus,
                  archetypes: userScopesRef.current.archetypes,
                }
              : { all: false, hus: new Set<string>(), archetypes: new Set<string>() },
            sortBy: DEFAULT_PROJECT_LIST_SORT,
          });
          const full = await warmProjectListClientPool(
            {
              periodName: primaryPeriodName,
              userId: currentUser.id,
              ...defaultFilters,
              skipCache: false,
            },
            token,
            abort.signal,
          );
          if (cancelled || abort.signal.aborted) return;
          const warmTotal =
            typeof full.meta.totalAssetCount === 'number'
              ? full.meta.totalAssetCount
              : full.enrichedAssets.length;
          const source = sealCompleteListSource(
            projectListBundleToListSource({
              ...full.meta,
              enrichedAssets: full.enrichedAssets,
              projects: full.projects,
              assetLastTaskMap: full.assetLastTaskMap,
              totalAssetCount: warmTotal,
            }),
          );
          if (!isCompleteListSource(source)) {
            if (!cancelled && !abort.signal.aborted) {
              setClientPoolWarmFailed(true);
            }
            return;
          }
          const scopedSource = sealCompleteListSource(
            scopeListSourceToUser(source, userScopesRef.current, {
              ready: userScopesReadyRef.current,
            }),
          );
          clientFilterPoolRef.current = { periodKey: poolKey, source: scopedSource };
          persistCompleteClientPool(poolKey, source);
          sourceDataRef.current = scopedSource;
          setClientFilterPoolReady(true);
          setClientPoolRevision((n) => n + 1);
          setClientPoolWarmFailed(false);
          writeProjectListCache(primaryPeriodName, currentUser.id, {
            ...full.meta,
            enrichedAssets: full.enrichedAssets,
            projects: full.projects,
            assetLastTaskMap: full.assetLastTaskMap,
            totalAssetCount: warmTotal,
          });
          logProjectListPipelineStage('client-filter-pool-ready', {
            periodKey: poolKey,
            rowCount: full.enrichedAssets.length,
            totalAssetCount: warmTotal,
          });
        } catch (err) {
          if (cancelled || abort.signal.aborted) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.warn('Capex project list client filter pool warm failed:', err);
          setClientPoolWarmFailed(true);
        }
      })();
    };

    const scheduleWarm = () => {
      if (typeof window === 'undefined') {
        deferTimer = setTimeout(runWarm, 5000);
        return;
      }
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (w.requestIdleCallback) {
        idleHandle = w.requestIdleCallback(runWarm, { timeout: 12_000 });
      } else {
        deferTimer = setTimeout(runWarm, 5000);
      }
    };

    scheduleWarm();

    return () => {
      cancelled = true;
      abort.abort();
      if (typeof window !== 'undefined') {
        const w = window as Window & { cancelIdleCallback?: (id: number) => void };
        if (idleHandle != null && w.cancelIdleCallback) w.cancelIdleCallback(idleHandle);
      }
      if (deferTimer) clearTimeout(deferTimer);
    };
  }, [
    currentUser?.id,
    userScopesReady,
    queryPeriodKey,
    primaryPeriodName,
    isMultiPeriodView,
    hasActiveTableFilters,
    capexBeUrl,
    persistCompleteClientPool,
    activateClientPoolFromCache,
    restoreClientPoolFromSession,
    userScopesRef,
    userScopesReadyRef,
  ]);

  useLayoutEffect(() => {
    const pool = clientFilterPoolRef.current?.source;
    if (!pool || !clientFilterPoolReady) return;
    applyMasterFromSource(pool);
  }, [clientFilterPoolReady, clientPoolRevision, applyMasterFromSource]);

  const prevMeetingFiltersKeyRef = useRef(
    `${meetingFilters.archetype ?? ''}\u0001${meetingFilters.assetTypeGroup ?? ''}`,
  );

  useLayoutEffect(() => {
    const nextKey = `${meetingFilters.archetype ?? ''}\u0001${meetingFilters.assetTypeGroup ?? ''}`;
    if (prevMeetingFiltersKeyRef.current === nextKey) return;
    const hadPrior = prevMeetingFiltersKeyRef.current !== '\u0001';
    prevMeetingFiltersKeyRef.current = nextKey;
    if (!hadPrior) return;

    setCurrentPage(1);
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    setTableRowsFiltersKey('');
    mustRefetchTableRef.current = true;
    clearTableRows();
  }, [
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    setCurrentPage,
    clearTableRows,
  ]);

  useLayoutEffect(() => {
    if (prevPanelFiltersKeyRef.current === panelFiltersKey) return;
    const hadPrior = prevPanelFiltersKeyRef.current !== '';
    prevPanelFiltersKeyRef.current = panelFiltersKey;
    if (!hadPrior) return;

    setCurrentPage(1);
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    setTableRowsFiltersKey('');
    mustRefetchTableRef.current = true;
    clearTableRows();
  }, [
    panelFiltersKey,
    setCurrentPage,
    clearTableRows,
    prevPanelFiltersKeyRef,
  ]);

  useLayoutEffect(() => {
    if (pipelineDiskPurgedRef.current || typeof window === 'undefined') return;
    const markerKey = 'capex.projectList.dataPolicy';
    const stored = window.localStorage.getItem(markerKey);
    if (stored !== PROJECT_LIST_DATA_POLICY) {
      invalidateAllCapexProjectListDiskCache();
      if (currentUser?.id) clearSessionClientPoolsForUser(currentUser.id);
      window.localStorage.setItem(markerKey, PROJECT_LIST_DATA_POLICY);
      logProjectListPipelineStage('disk-cache-purge', { policy: PROJECT_LIST_DATA_POLICY });
    }
    pipelineDiskPurgedRef.current = true;
  }, [currentUser?.id]);

  useLayoutEffect(() => {
    if (!needsPanelServerFetch && clientFilterPoolReady) return;
    if (!listFiltersKey || filtersKeyWithoutPageRef.current === listFiltersKey) return;
    const hadPriorKey = filtersKeyWithoutPageRef.current !== '';
    filtersKeyWithoutPageRef.current = listFiltersKey;
    if (hadPriorKey) {
      setCurrentPage(1);
    }
    lastAppliedFiltersKeyRef.current = '';
    lastAppliedRowIdsRef.current = '';
    if (!hadPriorKey || !currentUser || !queryPeriodKey) return;

    const pageOneKey = projectListFiltersCacheKey({
      periodName: queryPeriodKey,
      userId: currentUser.id,
      page: 1,
      pageSize: itemsPerPage,
      ...tableQueryFilters,
    });
    const cached = tryResolveTableBundleFromCache(1, itemsPerPage, pageOneKey);
    if (cached && bundleMatchesTableFilters(cached)) {
      mustRefetchTableRef.current = false;
      applyTableBundle(cached, { trustServerFilters: true });
    } else if (cached) {
      mustRefetchTableRef.current = true;
    }
  }, [
    listFiltersKey,
    currentUser?.id,
    queryPeriodKey,
    itemsPerPage,
    tableQueryFilters,
    needsPanelServerFetch,
    clientFilterPoolReady,
    tryResolveTableBundleFromCache,
    applyTableBundle,
    bundleMatchesTableFilters,
    setCurrentPage,
  ]);

  useLayoutEffect(() => {
    if (!needsPanelServerFetch && clientFilterPoolReady) return;
    if (!currentUser || !primaryPeriodName.trim() || !filtersKey || isMultiPeriodView) return;

    hydrateCapexProjectListTableFromDisk(
      queryClient,
      primaryPeriodName,
      currentUser.id,
      filtersKey,
      currentPage,
      itemsPerPage,
      { allowShellFallback: isDefaultTableView && !hasPanelTableFilters },
    );
    if (lastAppliedFiltersKeyRef.current === tableDisplayKey) return;

    const queryCached = queryClient.getQueryData<ProjectListBundle | null>(
      queryKeys.capexProjectList.table(
        queryPeriodKey,
        currentUser.id,
        filtersKey,
        currentPage,
        itemsPerPage,
      ),
    );
    if (queryCached && !isStaleProjectListBundle(queryCached.totalAssetCount, queryCached._debug)) {
      if (bundleMatchesTableFilters(queryCached)) {
        applyTableBundle(queryCached, { trustServerFilters: true });
      } else {
        mustRefetchTableRef.current = true;
      }
      return;
    }

    if (mustRefetchTableRef.current) return;

    if (diskTableSeed && bundleMatchesTableFilters(diskTableSeed)) {
      applyTableBundle(diskTableSeed, { trustServerFilters: true });
      return;
    }

    const resolved = tryResolveTableBundleFromCache(currentPage, itemsPerPage, filtersKey);
    if (resolved && bundleMatchesTableFilters(resolved)) {
      applyTableBundle(resolved, { trustServerFilters: true });
    } else if (resolved) {
      mustRefetchTableRef.current = true;
    }
  }, [
    currentUser?.id,
    primaryPeriodName,
    queryPeriodKey,
    filtersKey,
    tableDisplayKey,
    currentPage,
    itemsPerPage,
    queryClient,
    diskTableSeed,
    applyTableBundle,
    isMultiPeriodView,
    tryResolveTableBundleFromCache,
    bundleMatchesTableFilters,
    isDefaultTableView,
    hasPanelTableFilters,
    needsPanelServerFetch,
    clientFilterPoolReady,
  ]);

  const tableQuery = useQuery<ProjectListBundle | null>({
    queryKey: queryKeys.capexProjectList.table(
      queryPeriodKey,
      currentUser?.id ?? 0,
      filtersKey,
      currentPage,
      itemsPerPage,
    ),
    enabled: Boolean(
      currentUser &&
        userScopesReady &&
        effectivePeriods.length > 0 &&
        capexBeUrl &&
        needsPanelServerFetch &&
        !clientPoolWarmFailed,
    ),
    retry: (failureCount, err) => !isProjectListUnauthorizedError(err) && failureCount < 2,
    staleTime:
      !isMultiPeriodView && isDefaultTableView && !hasPanelTableFilters
        ? DEFAULT_TABLE_STALE_MS
        : FILTERED_TABLE_STALE_MS,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: hasActiveTableFilters || hasPanelTableFilters || !diskTableSeed,
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prevListKey = previousQuery.queryKey[5];
      const prevPage = previousQuery.queryKey[6];
      const prevPageSize = previousQuery.queryKey[7];
      // Placeholder hanya untuk refresh halaman yang sama — bukan saat ganti page/filter.
      if (
        prevListKey === listFiltersKey &&
        prevPage === currentPage &&
        prevPageSize === itemsPerPage
      ) {
        return previousData;
      }
      return undefined;
    },
    initialData: mayUseDiskSeed ? diskTableSeed : undefined,
    queryFn: async ({ signal }) => {
      if (!currentUser) throw new Error('Missing user');
      const bff = useBeBffProxy();
      let token: string | null = null;
      if (!bff || !useBackendSession()) {
        token = await getAccessTokenForBackend();
        if (!bff && !token) {
          throw new Error('Sesi tidak valid — login ulang untuk memuat daftar dari server.');
        }
      }
      try {
        const skipServerCache =
          mustRefetchTableRef.current || isMultiPeriodView || hasActiveTableFilters;
        const result = await fetchMergedProjectListPage(
          effectivePeriods,
          {
            userId: currentUser.id,
            ...tableQueryFilters,
            skipCache: skipServerCache,
          },
          currentPage,
          itemsPerPage,
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

  useEffect(() => {
    if (!tableQuery.isSuccess || !tableQuery.data) return;
    logProjectListPipelineStage('api-response', {
      totalAssetCount: tableQuery.data.totalAssetCount,
      pageRows: tableQuery.data.enrichedAssets?.length ?? 0,
      dbTruthCount: tableQuery.data._debug?.dbTruthCount,
      dbMatchedCount: tableQuery.data._debug?.dbMatchedCount,
      enrichDropped: tableQuery.data._debug?.enrichDroppedCount,
      cacheLayer: tableQuery.data._debug?.cacheLayer,
      policy: tableQuery.data._debug?.dataPolicy,
    });
  }, [tableQuery.isSuccess, tableQuery.data]);

  useEffect(() => {
    if (!tableQuery.isSuccess || !tableQuery.data || tableQuery.isPlaceholderData) return;
    if (clientFilterCanServe && !needsPanelServerFetch) return;
    applyTableBundle(tableQuery.data, { trustServerFilters: true });
  }, [
    clientFilterCanServe,
    needsPanelServerFetch,
    tableQuery.isSuccess,
    tableQuery.data,
    tableQuery.isPlaceholderData,
    applyTableBundle,
  ]);

  const filterQueryErrorShownRef = useRef(false);
  useEffect(() => {
    if (!tableQuery.isError) {
      filterQueryErrorShownRef.current = false;
      return;
    }
    console.warn('Capex BE project-list/query failed:', tableQuery.error);
    if (filterQueryErrorShownRef.current) return;
    filterQueryErrorShownRef.current = true;
    const msg =
      tableQuery.error instanceof Error ? tableQuery.error.message : 'Gagal memuat daftar dari server.';
    showToastRef.current(msg, 'error');
  }, [tableQuery.isError, tableQuery.error, showToastRef]);

  const hasListData =
    allAssets.length > 0 ||
    (tableQuery.data?.enrichedAssets?.length ?? 0) > 0 ||
    (diskTableSeed?.enrichedAssets?.length ?? 0) > 0;
  const hasTableOnDisk =
    !!diskTableSeed ||
    (!isMultiPeriodView &&
      !hasPanelTableFilters &&
      !!currentUser &&
      !!primaryPeriodName &&
      hasProjectListTableOnDisk(primaryPeriodName, currentUser.id));

  const isBackgroundRefresh =
    hasListData &&
    tableQuery.isFetching &&
    !tableQuery.isPending &&
    !isSearchStaging &&
    !hasPanelTableFilters &&
    !isPageTransition;

  const isPageTransition =
    needsPanelServerFetch &&
    Boolean(tableDisplayKey) &&
    tableRowsFiltersKey !== tableDisplayKey &&
    (tableQuery.isFetching || tableQuery.isPending);

  const isFilterRefreshing =
    needsPanelServerFetch &&
    hasActiveTableFilters &&
    ((isSearchActive && isSearchStaging) ||
      (tableQuery.isFetching &&
        !tableQuery.isPlaceholderData &&
        tableRowsFiltersKey !== tableDisplayKey));

  return {
    allAssets,
    setAllAssets,
    allProjects,
    setAllProjects,
    assetLastTaskMap,
    setAssetLastTaskMap,
    tableRowsFiltersKey,
    setTableRowsFiltersKey,
    listTotalAssetCount,
    setListTotalAssetCount,

    tableQuery,
    filtersKey,
    listFiltersKey,
    tableDisplayKey,

    clientFilteredPage,
    clientListFilters,
    clientFilterCanServe,
    needsPanelServerFetch,
    poolReadyForInstantPanelFilters,

    hasPanelTableFilters,
    hasActiveTableFilters,
    hasMeetingSlicers,
    serverFilters,
    tableQueryFilters,
    isDefaultTableView,

    diskTableSeed,
    hasListData,
    hasTableOnDisk,
    isBackgroundRefresh,
    isFilterRefreshing,
    isPageTransition,

    sourceDataRef,
    clientFilterPoolRef,
    clientPoolRevision,
    setClientPoolRevision,

    persistCompleteClientPool,
    activateClientPoolFromCache,
    mustRefetchTableRef,

    clearTableRows,
    resetTableForFilterChange,
    resetAppliedTableCacheKeys,
    setClientFilterPoolReady,
    resetTablePipelineForPeriodChange,
    applyTableBundle,
  };
}
