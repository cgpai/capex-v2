
import React, { useState, useEffect, useMemo, useCallback, useRef, memo, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EnrichedAsset, User, WorkflowSet, ArchetypeConfig, HospitalUnitConfig, AssetTaskStatus, TaskCurrentStatus, Project, ProjectPriorityConfig, WorkflowStep, TaskLog, BudgetCategoryConfig, AssetTypeConfig, AssetTypeGroupConfig, Asset, MOM, Page, BudgetPeriod } from '../types';
import * as taskService from '../services/taskService';
import { invalidateAssetTimelineCache } from '../lib/assetTimelineCache';
import * as configService from '../services/configService';
import {
  readProjectListCacheAnyAge,
  readProjectListCache,
  writeProjectListCache,
  type ProjectListBundle,
} from '../services/capexProjectListApi';
import { useBeBffProxy } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../lib/authSession';
import { normAssetKey } from '../lib/assetKeys';
import {
  type ListSource,
  type UserScopesForCapex,
  projectListBundleToListSource,
  scopeListSourceToUser,
  isCompleteListSource,
} from '../lib/capexProjectListScope';
import { usePermissions } from '../hooks/usePermissions';
import { AssetFilterPanel } from '../components/organisms/AssetFilterPanel/AssetFilterPanel';
import { buildCapexProjectListColumns } from './CapexProjectList/buildCapexProjectListColumns';
import { CapexProjectListTableBlock } from './CapexProjectList/CapexProjectListTableBlock';
import {
  buildWhatsAppReminderMessage,
  openWhatsAppReminder,
  resolveWhatsAppRecipients,
  type WhatsAppReminderPayload,
} from '../lib/whatsappReminder';
import { saveAssetViaBackend, saveProjectViaBackend } from '../services/capexCrudApi';
import { useToast } from '../contexts/ToastContext';
import { queryKeys } from '../lib/query-keys';
import { projectListFiltersCacheKey } from '../hooks/queries/fetchCapexProjectListQuery';
import {
  fetchAllMergedProjectListForExport,
  fetchMergedProjectListPage,
} from '../services/fetchMergedProjectListPage';
import {
  buildProjectListServerFilters,
  DEFAULT_PROJECT_LIST_SORT,
} from '../services/projectListQueryTypes';
import {
  readProjectListFilterSelection,
  writeProjectListTableCache,
  clearProjectListTableCachePage,
} from '../lib/capexProjectListDiskCache';
import { useCapexProjectListMasterConfig } from './CapexProjectList/useCapexProjectListMasterConfig';
import { useProjectListMaster } from './CapexProjectList/useProjectListMaster';
import type { ProjectListMasterBundle } from '../services/capexProjectListApi';
import { isAssetCancelledForProjectList } from '../lib/assetLifecycle';
import { logProjectListPipelineStage } from '../lib/projectListPipelineDebug';
import { deleteSessionClientPool } from '../lib/capexProjectListSessionPool';
import { userCanEditProjectPriority } from '../lib/projectPriorityPolicy';
import { countActionableWorkflowTasks } from '../lib/workflowRolePolicy';
import {
  abbrevBudgetCategoryName,
  buildAssetFilterMaps,
  buildAssetTypeGroupMasterMaps,
  buildClientFilteredProjectListExport,
  enrichedAssetsMatchMeetingFilters,
  enrichedAssetsMatchPanelFilters,
  filterEnrichedAssets,
  enrichProjectsForAssets,
  formatListDate,
  getProjectTimingInfo,
  isAllBudgetPeriodsSelected,
  isProjectListPeriodFilterActive,
  pickLatestBudgetPeriodName,
  resolveInitialProjectListSelectedPeriods,
  selectedPeriodsCacheKey,
  shouldUsePreloadedProjectListForPeriods,
  normFilterName,
  findEnrichedAssetByCode,
  resolvePreloadedTableScope,
  calculateAssetCompletionRates,
} from './CapexProjectList/listUtils';
import { useProjectListFilterState } from './CapexProjectList/hooks/useProjectListFilterState';
import {
  useProjectListPeriodConfig,
  useProjectListEffectivePeriods,
} from './CapexProjectList/hooks/useProjectListPeriods';
import { useProjectListTableDisplay } from './CapexProjectList/hooks/useProjectListTableDisplay';
import { useProjectListTablePipeline } from './CapexProjectList/hooks/useProjectListTablePipeline';
import { buildScopedArchetypeOptions } from '../lib/scopedFilterOptions';
import { PageTourOverlay } from '../features/onboarding/PageTourOverlay';
import { buildCapexProjectListTourSteps, CAPEX_PROJECT_LIST_TOUR_ID, CAPEX_PROJECT_LIST_TOUR_VERSION } from '../features/onboarding/capexProjectListTour';
import { usePageTour } from '../features/onboarding/usePageTour';
import { HelpCircle, Zap } from 'lucide-react';
import { QuickTaskDoneModal } from './CapexProjectList/QuickTaskDoneModal';
import {
  handleProjectListTriggerTaskSave,
  type ProjectListTriggerTaskSaveParams,
} from './CapexProjectList/handleProjectListTriggerTaskSave';

const CapexProjectListDetailPanel = lazy(() =>
  import('./CapexProjectList/CapexProjectListDetailPanel').then((m) => ({
    default: m.CapexProjectListDetailPanel,
  })),
);

interface CapexProjectListPageProps {
  currentUser: User | null;
  /** Budget period used for disk preload (global app selection). */
  periodName: string;
  /** All configured budget periods — source of truth for the page filter. */
  budgetPeriods?: BudgetPeriod[];
  /** @deprecated Use budgetPeriods */
  allPeriodNames?: string[];
  /**
   * Bundle list dari session/localStorage, dibaca sinkron di App.
   * Membuat paint pertama berisi tabel (tanpa menunggu useLayoutEffect).
   */
  preloadedProjectList?: ProjectListBundle | null;
  /**
   * False saat login baru: assignments belum di-bootstrap — jangan filter scope dulu
   * (hindari tabel kosong sampai fetchAppBootstrapData selesai).
   */
  userScopesReady?: boolean;
}

const formatDate = formatListDate;

const CapexProjectListPageInner: React.FC<CapexProjectListPageProps> = ({
  currentUser,
  periodName,
  budgetPeriods,
  allPeriodNames,
  preloadedProjectList,
  userScopesReady = true,
}) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const useBff = useBeBffProxy();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const periodsFilterHydratedRef = useRef(false);
  const hadPeriodOptionsOnMountRef = useRef(
    (budgetPeriods?.length ?? 0) > 0 || (allPeriodNames?.length ?? 0) > 0,
  );
  const savedFiltersRef = useRef(
    typeof window !== 'undefined' ? readProjectListFilterSelection() : null,
  );

  const { resolvedBudgetPeriods, availablePeriodOptions, initialSelectedPeriods } =
    useProjectListPeriodConfig(periodName, budgetPeriods, allPeriodNames, savedFiltersRef.current);

  const {
    selectedPeriods,
    setSelectedPeriods,
    searchTerm,
    setSearchTerm,
    selectedHUs,
    setSelectedHUs,
    selectedPriorities,
    setSelectedPriorities,
    selectedFinishedTasks,
    setSelectedFinishedTasks,
    selectedBudgetFilter,
    setSelectedBudgetFilter,
    completionRange,
    setCompletionRange,
    meetingFilters,
    setMeetingFilters,
    selectedBudgetCategoryIds,
    setSelectedBudgetCategoryIds,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    sortBy,
    setSortBy,
    appliedSearchTerm,
    commitSearchTerm,
    clearSearch,
    isSearchActive,
    isSearchStaging,
    panelFiltersKey,
    prevPanelFiltersKeyRef,
  } = useProjectListFilterState(currentUser, initialSelectedPeriods);

  const activePreloadedProjectList = useMemo(
    () =>
      shouldUsePreloadedProjectListForPeriods(initialSelectedPeriods, periodName)
        ? (preloadedProjectList ?? null)
        : null,
    [initialSelectedPeriods, periodName, preloadedProjectList],
  );

  /** Paint preload hanya jika baris cocok slicer & panel filter tersimpan. */
  const usePreloadedTableRows = useMemo(() => {
    if (!activePreloadedProjectList?.enrichedAssets?.length) return false;
    const saved = savedFiltersRef.current;
    const savedArch = saved?.meetingArchetype ?? null;
    const savedGroup = saved?.meetingAssetTypeGroup ?? null;
    const savedHUs = saved?.selectedHUs ?? [];
    const savedPriorities = saved?.selectedPriorities ?? [];
    const savedFinished = saved?.selectedFinishedTasks ?? [];
    const savedBudgetFilter = saved?.selectedBudgetFilter ?? null;
    const savedCategories = saved?.selectedBudgetCategoryIds ?? [];
    const savedSearch = saved?.searchTerm?.trim().toLowerCase() ?? '';
    const savedCompletion = {
      min: saved?.completionMin ?? 0,
      max: saved?.completionMax ?? 100,
    };
    const hasSavedPanel =
      savedHUs.length > 0 ||
      savedPriorities.length > 0 ||
      savedFinished.length > 0 ||
      Boolean(savedBudgetFilter) ||
      savedCategories.length > 0 ||
      savedSearch.length > 0 ||
      savedCompletion.min > 0 ||
      savedCompletion.max < 100;

    if (!savedArch && !savedGroup && !hasSavedPanel) return true;
    if (savedGroup?.trim()) return false;

    const assets = activePreloadedProjectList.enrichedAssets;
    const archById = new Map(
      (activePreloadedProjectList.archetypes ?? []).map(
        (a) => [String(a.id), a.name] as const,
      ),
    );
    const preloadArchetypeByHuName = new Map<string, string>();
    for (const hu of activePreloadedProjectList.hus ?? []) {
      const archName = archById.get(
        String(hu.archetypeId ?? (hu as { archetype_id?: string }).archetype_id ?? ''),
      );
      if (archName) preloadArchetypeByHuName.set(hu.name, archName);
    }

    if (
      (savedArch || savedGroup) &&
      !enrichedAssetsMatchMeetingFilters(
        assets,
        { archetype: savedArch, assetTypeGroup: savedGroup },
        undefined,
        preloadArchetypeByHuName,
      )
    ) {
      return false;
    }

    if (hasSavedPanel) {
      const maps = buildAssetFilterMaps(
        activePreloadedProjectList.projects,
        activePreloadedProjectList.priorities,
        assets,
      );
      const lastMap = new Map(
        Object.entries(activePreloadedProjectList.assetLastTaskMap ?? {}).map(
          ([k, v]) => [normAssetKey(k), v] as [string, string],
        ),
      );
      if (
        !enrichedAssetsMatchPanelFilters(
          assets,
          {
            selectedHUs: savedHUs,
            selectedPriorities: savedPriorities,
            selectedFinishedTasks: savedFinished,
            selectedBudgetFilter: savedBudgetFilter,
            selectedBudgetCategoryIds: savedCategories,
            completionRange: savedCompletion,
            searchLower: savedSearch,
          },
          maps,
          lastMap,
          { archetypeByHuName: preloadArchetypeByHuName },
        )
      ) {
        return false;
      }
    }

    return true;
  }, [activePreloadedProjectList]);

  const masterDataHydratedRef = useRef(
    (activePreloadedProjectList?.workflows?.length ?? 0) > 0 ||
      (activePreloadedProjectList?.archetypes?.length ?? 0) > 0,
  );

  // Data state — baris tabel: init dari preloaded agar paint pertama tidak kosong
  const [allWorkflows, setAllWorkflows] = useState<WorkflowSet[]>(
    () => activePreloadedProjectList?.workflows ?? [],
  );
  const [priorities, setPriorities] = useState<ProjectPriorityConfig[]>(
    () => activePreloadedProjectList?.priorities ?? [],
  );
  const [allRoles, setAllRoles] = useState<any[]>(() => activePreloadedProjectList?.allRoles ?? []);
  const [allTasks, setAllTasks] = useState<any[]>(() => activePreloadedProjectList?.allTasks ?? []);
  const [masterData, setMasterData] = useState<{ archetypes: ArchetypeConfig[]; hus: HospitalUnitConfig[]; users: User[] }>(
    () => ({
      archetypes: activePreloadedProjectList?.archetypes ?? [],
      hus: activePreloadedProjectList?.hus ?? [],
      users: activePreloadedProjectList?.users ?? [],
    }),
  );
  const masterConfig = useCapexProjectListMasterConfig(currentUser?.id);
  const allCategories = masterConfig.categories;
  const allAssetTypes = masterConfig.assetTypes;
  const allAssetTypeGroups = masterConfig.assetTypeGroups;

  const refreshMasterConfig = useCallback(() => {
    void masterConfig.reloadMasterConfig({ fresh: true });
  }, [masterConfig]);

  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.CapexProjectList, 'view');

  const listUserScopes = useMemo(
    () => ({
      all: permissions.userScopes.all,
      hus: permissions.userScopes.hus,
      archetypes: permissions.userScopes.archetypes,
    }),
    [
      permissions.userScopes.all,
      [...permissions.userScopes.hus].sort().join('\u0001'),
      [...permissions.userScopes.archetypes].sort().join('\u0001'),
    ],
  );
  const userScopesRef = useRef<UserScopesForCapex>(permissions.userScopes);
  userScopesRef.current = permissions.userScopes;
  const userScopesReadyRef = useRef(userScopesReady);
  userScopesReadyRef.current = userScopesReady;

  const resolveInitialPreloadScope = useCallback(() => {
    if (!usePreloadedTableRows || !activePreloadedProjectList || !currentUser || !userScopesReady) {
      return null;
    }
    return resolvePreloadedTableScope(
      usePreloadedTableRows,
      activePreloadedProjectList,
      currentUser,
      permissions.userScopes,
      userScopesReady,
    );
  }, [
    usePreloadedTableRows,
    activePreloadedProjectList,
    currentUser,
    userScopesReady,
    permissions.userScopes,
  ]);

  // UI State
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isMomModalOpen, setMomModalOpen] = useState(false);
  const [momEditTarget, setMomEditTarget] = useState<MOM | null>(null);
  const [isAdhocTaskModalOpen, setAdhocTaskModalOpen] = useState(false);
  /** Increment to force AssetTaskTimeline to refetch after MOM / ad-hoc add. */
  const [timelineRefreshNonce, setTimelineRefreshNonce] = useState(0);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [isActionPopupOpen, setIsActionPopupOpen] = useState(false);
  const [isProjectEditorOpen, setIsProjectEditorOpen] = useState(false);
  const [isAssetEditorOpen, setIsAssetEditorOpen] = useState(false);
  
  // Summary Grid State
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isQuickTaskDoneModalOpen, setIsQuickTaskDoneModalOpen] = useState(false);

  // Priority inline-edit state
  const [savingPriorityProjectId, setSavingPriorityProjectId] = useState<string | null>(null);
  const canEditPriority = useMemo(() => userCanEditProjectPriority(currentUser), [currentUser]);

  const sourceDataByPeriodRef = useRef<Map<string, ListSource>>(new Map());
  const getPeriodUserKey = (uid: number, pName: string) => `${uid}::${pName}`;

  const capexBeUrl =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim() ?? '' : '';

  const {
    effectivePeriods,
    queryPeriodKey,
    isMultiPeriodView,
    primaryPeriodName,
    hasPeriodSubsetFilter,
  } = useProjectListEffectivePeriods(
    periodName,
    resolvedBudgetPeriods,
    availablePeriodOptions,
    selectedPeriods,
  );

  /** Master config (workflow, HU, roles) — sekali per user via `/project-list/master`. */
  const applyMasterFromMasterBundle = useCallback((master: ProjectListMasterBundle) => {
    if (!masterDataHydratedRef.current) {
      masterDataHydratedRef.current = true;
      setAllWorkflows(master.workflows);
      setMasterData({ archetypes: master.archetypes, hus: master.hus, users: master.users });
      setAllRoles(master.allRoles);
      setAllTasks(master.allTasks);
    }
    if (master.priorities?.length) {
      setPriorities(master.priorities);
    }
  }, []);

  const masterQuery = useProjectListMaster(currentUser?.id, canView);

  useEffect(() => {
    if (masterQuery.data) {
      applyMasterFromMasterBundle(masterQuery.data);
    }
  }, [masterQuery.data, applyMasterFromMasterBundle]);

  /** Legacy: client pool / disk cache may still ship master inline. */
  const applyMasterFromSource = useCallback(
    (source: ListSource) => {
      if ((source.workflows?.length ?? 0) > 0 && !masterDataHydratedRef.current) {
        masterDataHydratedRef.current = true;
        setAllWorkflows(source.workflows);
        setMasterData({ archetypes: source.archetypes, hus: source.hus, users: source.users });
        setAllRoles(source.allRoles);
        setAllTasks(source.allTasks);
      }
      if (source.priorities?.length) {
        setPriorities(source.priorities);
      }
      if (currentUser && primaryPeriodName) {
        sourceDataByPeriodRef.current.set(getPeriodUserKey(currentUser.id, primaryPeriodName), source);
      }
    },
    [currentUser, primaryPeriodName],
  );

  useEffect(() => {
    masterDataHydratedRef.current = false;
  }, [currentUser?.id]);

  const assetTypeGroupMaster = useMemo(
    () => buildAssetTypeGroupMasterMaps(allAssetTypeGroups, allAssetTypes),
    [allAssetTypeGroups, allAssetTypes],
  );
  const assetTypeGroupFilterOptions = assetTypeGroupMaster.groupNames;

  const archetypeByHuName = useMemo(() => {
    const archById = new Map(masterData.archetypes.map((a) => [a.id, a.name] as const));
    const m = new Map<string, string>();
    for (const hu of masterData.hus) {
      const archName = archById.get(
        hu.archetypeId ?? (hu as { archetype_id?: string }).archetype_id ?? '',
      );
      if (archName) m.set(hu.name, archName);
    }
    return m;
  }, [masterData.archetypes, masterData.hus]);

  const {
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
  } = useProjectListTablePipeline({
    queryClient,
    currentUser,
    userScopesReady,
    userScopesRef,
    userScopesReadyRef,
    listUserScopes,
    permissions,
    capexBeUrl,
    periodName,
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
    masterPriorities: priorities,
    applyMasterFromSource,
    masterDataHydratedRef,
    showToastRef,
    usePreloadedTableRows,
    activePreloadedProjectList,
    resolveInitialPreloadScope,
  });

  const handleSearchSubmit = useCallback(() => {
    commitSearchTerm(searchTerm);
    setSelectedAssetId(null);
    resetTableForFilterChange();
    if (currentUser?.id) {
      void queryClient.invalidateQueries({
        queryKey: ['screen', 'capex-project-list', 'table'],
      });
    }
  }, [
    searchTerm,
    commitSearchTerm,
    resetTableForFilterChange,
    currentUser?.id,
    queryClient,
  ]);

  const handleSearchReset = useCallback(() => {
    clearSearch();
    setSelectedAssetId(null);
    resetTableForFilterChange();
  }, [clearSearch, resetTableForFilterChange]);

  const handleHUFilterChange = useCallback(
    (next: string[]) => {
      setSelectedHUs(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setSelectedHUs, resetTableForFilterChange],
  );

  const handlePriorityFilterChange = useCallback(
    (next: string[]) => {
      setSelectedPriorities(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setSelectedPriorities, resetTableForFilterChange],
  );

  const handleBudgetCategoryFilterChange = useCallback(
    (next: string[]) => {
      setSelectedBudgetCategoryIds(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setSelectedBudgetCategoryIds, resetTableForFilterChange],
  );

  const handleFinishedTaskFilterChange = useCallback(
    (next: string[]) => {
      setSelectedFinishedTasks(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setSelectedFinishedTasks, resetTableForFilterChange],
  );

  const handleBudgetProjectFilterChange = useCallback(
    (next: string | null) => {
      setSelectedBudgetFilter(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setSelectedBudgetFilter, resetTableForFilterChange],
  );

  const handleCompletionRangeChange = useCallback(
    (next: { min: number; max: number }) => {
      setCompletionRange(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();
    },
    [setCompletionRange, resetTableForFilterChange],
  );

  const prevMeetingFiltersRef = useRef(meetingFilters);

  const handlePeriodFilterChange = useCallback(
    (next: string[]) => {
      const prevKey = selectedPeriodsCacheKey(selectedPeriods);
      const nextKey = selectedPeriodsCacheKey(next);
      setSelectedPeriods(next);
      if (prevKey === nextKey) return;
      resetTablePipelineForPeriodChange();
    },
    [selectedPeriods, resetTablePipelineForPeriodChange],
  );

  /** Meeting + multi-period slicers always server-side; panel HU/search may use client pool when warm. */
  const handleMeetingFilterChange = useCallback(
    (next: { archetype: string | null; assetTypeGroup: string | null }) => {
      const archetypeChanged = prevMeetingFiltersRef.current.archetype !== next.archetype;
      const assetGroupChanged =
        prevMeetingFiltersRef.current.assetTypeGroup !== next.assetTypeGroup;
      if (!archetypeChanged && !assetGroupChanged) return;

      prevMeetingFiltersRef.current = next;
      setMeetingFilters(next);
      setSelectedAssetId(null);
      resetTableForFilterChange();

      if (activateClientPoolFromCache(queryPeriodKey)) {
        sourceDataRef.current = clientFilterPoolRef.current!.source;
        setClientFilterPoolReady(true);
      }

      if (archetypeChanged) {
        if (!next.archetype) {
          setSelectedHUs([]);
        } else {
          const arch = masterData.archetypes.find(
            (a) => normFilterName(a.name) === normFilterName(next.archetype),
          );
          if (arch) {
            const allowed = new Set(
              masterData.hus
                .filter(
                  (hu) =>
                    String(hu.archetypeId ?? (hu as { archetype_id?: string }).archetype_id) ===
                    String(arch.id),
                )
                .map((hu) => hu.name),
            );
            setSelectedHUs((prev) => prev.filter((name) => allowed.has(name)));
          } else {
            setSelectedHUs([]);
          }
        }
      }
    },
    [
      masterData.archetypes,
      masterData.hus,
      queryPeriodKey,
      activateClientPoolFromCache,
      sourceDataRef,
      clientFilterPoolRef,
      resetTableForFilterChange,
      setClientFilterPoolReady,
      setMeetingFilters,
      setSelectedHUs,
    ],
  );

  useEffect(() => {
    if (!currentUser?.id) return;
    void masterConfig.reloadMasterConfig();
  }, [currentUser?.id, masterConfig]);

  /** Prune saved HU selection that conflicts with saved meeting archetype once master loads. */
  useEffect(() => {
    const archName = meetingFilters.archetype;
    if (!archName?.trim() || selectedHUs.length === 0) return;
    const arch = masterData.archetypes.find(
      (a) => normFilterName(a.name) === normFilterName(archName),
    );
    if (!arch) {
      setSelectedHUs([]);
      return;
    }
    const allowed = new Set(
      masterData.hus
        .filter(
          (hu) =>
            String(hu.archetypeId ?? (hu as { archetype_id?: string }).archetype_id) ===
            String(arch.id),
        )
        .map((hu) => normFilterName(hu.name)),
    );
    setSelectedHUs((prev) => {
      const next = prev.filter((name) => allowed.has(normFilterName(name)));
      return next.length === prev.length ? prev : next;
    });
  }, [meetingFilters.archetype, masterData.archetypes, masterData.hus, selectedHUs.length]);

  useEffect(() => {
    if (!currentUser || !periodName || capexBeUrl) return;
    const hadCache =
      readProjectListCache(periodName, currentUser.id) ??
      readProjectListCacheAnyAge(periodName, currentUser.id);
    if (!hadCache) {
      showToastRef.current(
        'Daftar Capex memakai API server (capexbe). Set NEXT_PUBLIC_CAPEXBE_URL dan jalankan backend — data tidak dimuat dari browser.',
        'error',
      );
    }
  }, [currentUser, periodName, capexBeUrl]);

  useEffect(() => {
    if (hadPeriodOptionsOnMountRef.current) return;
    if (!currentUser || resolvedBudgetPeriods.length === 0 || periodsFilterHydratedRef.current) return;
    if (availablePeriodOptions.length === 0) return;
    periodsFilterHydratedRef.current = true;
    const saved = savedFiltersRef.current ?? readProjectListFilterSelection();
    if (!saved) return;
    setSelectedPeriods(resolveInitialProjectListSelectedPeriods(saved, resolvedBudgetPeriods));
  }, [currentUser?.id, resolvedBudgetPeriods, availablePeriodOptions.length]);

  useEffect(() => {
    if (availablePeriodOptions.length === 0) return;
    setSelectedPeriods((prev) => {
      if (prev.length === 0) return prev;
      const valid = prev.filter((p) => availablePeriodOptions.includes(p));
      if (valid.length === prev.length) return prev;
      if (valid.length > 0) return valid;
      const latest = pickLatestBudgetPeriodName(resolvedBudgetPeriods);
      return latest ? [latest] : [];
    });
  }, [availablePeriodOptions, resolvedBudgetPeriods]);

  /** Single-period + warm pool → client filter (instant & accurate). Else server pagination. */
  const useClientFilteredDisplay = Boolean(
    !isMultiPeriodView && clientFilterCanServe && clientFilteredPage,
  );

  const {
    paginatedAssets,
    tableAssets,
    footerTotalCount,
    serverTableReady,
  } = useProjectListTableDisplay({
    useClientFilteredDisplay,
    clientFilteredPage,
    serverTableReady: tableRowsFiltersKey === tableDisplayKey,
    allAssets,
    listTotalAssetCount,
    allowPreloadRows: false,
    deferTableRows: (isSearchActive && isSearchStaging) || isFilterRefreshing,
    isPageTransition,
  });

  /** Detail panel keyed by asset.id — resolve row from current page / cache only. */
  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    const key = normAssetKey(selectedAssetId);
    return (
      paginatedAssets.find((a) => normAssetKey(a.id) === key) ??
      allAssets.find((a) => normAssetKey(a.id) === key) ??
      null
    );
  }, [selectedAssetId, paginatedAssets, allAssets]);

  /** Projects aligned with visible rows only — no full pool merge. */
  const tableProjectsForColumns = useMemo(() => {
    const base =
      useClientFilteredDisplay && clientFilteredPage?.projects.length
        ? clientFilteredPage.projects
        : allProjects;
    return enrichProjectsForAssets(paginatedAssets, base);
  }, [
    useClientFilteredDisplay,
    clientFilteredPage,
    allProjects,
    paginatedAssets,
  ]);

  const tableLastTaskMapForColumns = useMemo(() => {
    if (useClientFilteredDisplay && clientFilteredPage?.assetLastTaskMap) {
      return clientFilteredPage.assetLastTaskMap;
    }
    return assetLastTaskMap;
  }, [useClientFilteredDisplay, clientFilteredPage, assetLastTaskMap, clientPoolRevision]);

  /** Full pool for Quick Task code lookup — client filter pool, not just server page rows. */
  const assetsForQuickTaskLookup = useMemo(() => {
    const byId = new Map<string, EnrichedAsset>();
    const ingest = (list: EnrichedAsset[]) => {
      for (const asset of list) {
        byId.set(normAssetKey(asset.id), asset);
      }
    };

    const pool = clientFilterPoolRef.current;
    if (pool?.periodKey === queryPeriodKey && pool.source.assets.length > 0) {
      ingest(pool.source.assets);
    } else if (sourceDataRef.current?.assets.length) {
      ingest(sourceDataRef.current.assets);
    }

    ingest(allAssets);
    ingest(paginatedAssets);

    return Array.from(byId.values());
  }, [clientPoolRevision, queryPeriodKey, allAssets, paginatedAssets]);

  const resolveAssetByCodeForQuickTask = useCallback(
    async (code: string): Promise<EnrichedAsset | null> => {
      const local = findEnrichedAssetByCode(assetsForQuickTaskLookup, code);
      if (local) return local;
      if (!currentUser || !capexBeUrl || effectivePeriods.length === 0) return null;

      try {
        const bff = useBff;
        let token: string | null = null;
        if (!bff || !useBackendSession()) {
          token = await getAccessTokenForBackend();
        }
        const quickSearchFilters = buildProjectListServerFilters({
          searchTerm: code.trim(),
          selectedHUs: [],
          meetingFilters: { archetype: null, assetTypeGroup: null },
          selectedPriorities: [],
          selectedBudgetCategoryIds: [],
          selectedBudgetFilter: null,
          selectedFinishedTasks: [],
          completionRange: { min: 0, max: 100 },
          userScopes: permissions.userScopes,
          sortBy: DEFAULT_PROJECT_LIST_SORT,
        });
        const result = await fetchMergedProjectListPage(
          effectivePeriods,
          {
            userId: currentUser.id,
            ...quickSearchFilters,
            skipCache: true,
          },
          1,
          50,
          token,
        );
        return findEnrichedAssetByCode(result.enrichedAssets, code);
      } catch {
        return null;
      }
    },
    [assetsForQuickTaskLookup, currentUser, capexBeUrl, effectivePeriods, permissions.userScopes, useBff],
  );

  const totalPages = Math.max(1, Math.ceil(footerTotalCount / itemsPerPage));

  useEffect(() => {
    logProjectListPipelineStage('render-state', {
      footerTotalCount,
      pageRows: paginatedAssets.length,
      currentPage,
      itemsPerPage,
    });
  }, [footerTotalCount, paginatedAssets.length, currentPage, itemsPerPage]);

  // Page reset on filter change: useLayoutEffect(listFiltersKey) above runs before fetch.

  useEffect(() => {
    if (selectedAssetId && !paginatedAssets.some((a) => normAssetKey(a.id) === normAssetKey(selectedAssetId))) {
      setSelectedAssetId(null);
    }
  }, [paginatedAssets, selectedAssetId]);

  useEffect(() => {
    setIsActionPopupOpen(false);
  }, [selectedAssetId]);

  // Update hanya row asset yang berubah (tanpa reload seluruh list/screen)
  const refreshSingleAssetData = useCallback((asset: EnrichedAsset) => {
    const str = (id: string | number | undefined) => (id == null ? '' : String(id));
    const idForApi = str(asset.id);
    const mapKey = normAssetKey(asset.id);
    const isDoneRow = (s: AssetTaskStatus) =>
      typeof s.status === 'string' ? s.status.toLowerCase() === 'done' : s.status === TaskCurrentStatus.Done;

    (async () => {
      try {
        const [statuses, logs] = await Promise.all([
          taskService.getAssetTaskStatusesForAsset(idForApi),
          taskService.getTaskLogsForAsset(idForApi),
        ]);
        const workflow = allWorkflows.find(w => str(w.id) === str(asset.workflowSetId));
        if (!workflow) return;
        const statusesByAsset = new Map<string, AssetTaskStatus[]>([[mapKey, statuses]]);
        const logsByAsset = new Map<string, TaskLog[]>([[mapKey, logs]]);
        const rates = calculateAssetCompletionRates([asset], allWorkflows, statusesByAsset, logsByAsset);
        const rate = rates.get(mapKey) ?? 0;

        const stepTaskIds = new Set(workflow.steps.map(s => str(s.taskId)));
        const doneFromStatuses = new Set(
          statuses.filter(isDoneRow).map(s => str(s.taskId)).filter(tid => stepTaskIds.has(tid)),
        );
        const doneFromLogs = new Set(logs.map(l => str(l.taskId)).filter(tid => stepTaskIds.has(tid)));
        const completedTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);

        let lastTaskName = 'Not Started';
        if (completedTaskIds.size > 0) {
          let lastStep: WorkflowStep | null = null;
          let maxOrder = -1;
          for (const taskIdStr of completedTaskIds) {
            const step = workflow.steps.find(s => str(s.taskId) === taskIdStr);
            if (step && step.order > maxOrder) {
              maxOrder = step.order;
              lastStep = step;
            }
          }
          if (lastStep) {
            const task = allTasks.find(t => str(t.id) === str(lastStep.taskId));
            lastTaskName = task ? task.name : 'In Progress (Unknown)';
          } else {
            lastTaskName = 'In Progress (Unknown)';
          }
        }

        const actionableCount = currentUser
          ? countActionableWorkflowTasks(currentUser, workflow, statuses, allRoles)
          : 0;
        const projectionDates = taskService.calculateProjectionDates(workflow, statuses);
        const lastStepOrder = workflow.steps.sort((a, b) => b.order - a.order)[0];
        const projectionEndDate = lastStepOrder ? projectionDates.get(String(lastStepOrder.taskId)) : undefined;

        setAllAssets(prev =>
          prev.map(a =>
            normAssetKey(a.id) === mapKey
              ? { ...a, completionRate: rate, actionableTaskCount: actionableCount, projectionEndDate }
              : a,
          ),
        );
        setAssetLastTaskMap(prev => new Map(prev).set(mapKey, lastTaskName));

        if (sourceDataRef.current && currentUser && primaryPeriodName.trim()) {
          const cachePeriod = primaryPeriodName.trim();
          const src = sourceDataRef.current;
          const nextAssets = src.assets.map(a =>
            normAssetKey(a.id) === mapKey
              ? { ...a, completionRate: rate, actionableTaskCount: actionableCount, projectionEndDate }
              : a,
          );
          const nextRecord = { ...src.assetLastTaskMap, [mapKey]: lastTaskName };
          const nextSource: ListSource = { ...src, assets: nextAssets, assetLastTaskMap: nextRecord };
          sourceDataRef.current = nextSource;
          sourceDataByPeriodRef.current.set(getPeriodUserKey(currentUser.id, cachePeriod), nextSource);
          const cached = readProjectListCache(cachePeriod, currentUser.id);
          const nextBundle: ProjectListBundle = cached
            ? {
                ...cached,
                enrichedAssets: nextAssets,
                assetLastTaskMap: { ...cached.assetLastTaskMap, [mapKey]: lastTaskName },
                totalAssetCount: src.totalAssetCount ?? cached.totalAssetCount,
              }
            : {
                enrichedAssets: nextSource.assets,
                projects: nextSource.projects,
                workflows: nextSource.workflows,
                archetypes: nextSource.archetypes,
                hus: nextSource.hus,
                users: nextSource.users,
                priorities: nextSource.priorities,
                allRoles: nextSource.allRoles,
                allTasks: nextSource.allTasks,
                assetLastTaskMap: nextSource.assetLastTaskMap,
                totalAssetCount: nextSource.totalAssetCount,
              };
          writeProjectListCache(cachePeriod, currentUser.id, nextBundle);
        }
      } catch (_e) {
      }
    })();
  }, [allWorkflows, allRoles, allTasks, currentUser, primaryPeriodName]);

  const handleTaskUpdate = useCallback((assetId?: string) => {
    if (assetId) invalidateAssetTimelineCache(assetId);
    const idNorm = assetId != null ? normAssetKey(assetId) : null;
    const asset = assetId != null
      ? allAssets.find(a => normAssetKey(a.id) === idNorm)
      : selectedAssetId
        ? allAssets.find((a) => normAssetKey(a.id) === normAssetKey(selectedAssetId))
        : null;
    if (asset) refreshSingleAssetData(asset);
  }, [allAssets, selectedAssetId, refreshSingleAssetData]);

  const handleRowClick = useCallback((asset: EnrichedAsset) => {
    const id = String(asset.id);
    setSelectedAssetId((prev) => {
      if (prev === id) return null;
      const wfId = asset.workflowSetId ?? (asset as { workflow_set_id?: string }).workflow_set_id ?? '';
      if (String(wfId).trim()) {
        const project = allProjects.find((p) => String(p.id) === String(asset.projectId));
        void taskService.prefetchAssetTimeline(asset.id, String(wfId), project?.id);
      }
      return id;
    });
  }, [allProjects]);

  const handleRowHover = useCallback((_asset: EnrichedAsset) => {
    // Timeline/detail fetched on row click only (asset.id).
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = useCallback(async () => {
    if (!currentUser || effectivePeriods.length === 0 || isExporting) return;
    if (footerTotalCount === 0) {
      showToast('Tidak ada data untuk diekspor.', 'error');
      return;
    }

    setIsExporting(true);
    try {
      refreshMasterConfig();

      let exportAssets: EnrichedAsset[] = [];
      let exportProjects: Project[] = [];
      let exportLastMap = new Map<string, string>();
      const expectedTotal = footerTotalCount;

      const pool = clientFilterPoolRef.current;
      const canExportFromClientPool =
        clientFilterCanServe &&
        pool != null &&
        pool.periodKey === queryPeriodKey &&
        isCompleteListSource(pool.source);

      if (canExportFromClientPool && pool) {
        const scoped = scopeListSourceToUser(pool.source, permissions.userScopes, {
          ready: userScopesReady,
        });
        const clientExport = buildClientFilteredProjectListExport(scoped, clientListFilters);
        exportAssets = clientExport.enrichedAssets;
        exportProjects = clientExport.projects;
        exportLastMap = clientExport.assetLastTaskMap;
      } else if (capexBeUrl) {
        let token: string | null = null;
        if (!useBff || !useBackendSession()) {
          token = await getAccessTokenForBackend();
        }
        const full = await fetchAllMergedProjectListForExport(
          effectivePeriods,
          {
            userId: currentUser.id,
            ...serverFilters,
            skipCache: true,
          },
          token,
        );
        exportAssets = full.enrichedAssets;
        exportProjects = full.projects;
        exportLastMap = new Map(
          Object.entries(full.assetLastTaskMap).map(([k, v]) => [normAssetKey(k), v] as [string, string]),
        );
        if (exportAssets.length < expectedTotal) {
          showToast(
            `Export ${exportAssets.length.toLocaleString('id-ID')} baris (diharapkan ${expectedTotal.toLocaleString('id-ID')}).`,
            'error',
          );
        }
      } else {
        showToast(
          'Export memerlukan backend (NEXT_PUBLIC_CAPEXBE_URL) untuk memuat semua baris sesuai filter.',
          'error',
        );
        return;
      }

      if (exportAssets.length === 0) {
        showToast('Tidak ada baris untuk diekspor dengan filter saat ini.', 'error');
        return;
      }

      const XLSX = await import('xlsx');
      const categories =
        allCategories.length > 0
          ? allCategories
          : await configService.getAllBudgetCategories().catch(() => []);
      const categoryIdToNameMap = new Map<string, string>(
        categories.map((c) => [c.id, c.name] as [string, string]),
      );
      const priorityIdToNameMap = new Map<string, string>(
        priorities.map((p) => [p.id, p.name] as [string, string]),
      );
      const projectMap = new Map<string, Project>(
        exportProjects.map((project) => [String(project.id), project]),
      );

      const rows = exportAssets.map((asset, index) => {
        const project = projectMap.get(String(asset.projectId));
        const priorityName = project ? priorityIdToNameMap.get(project.priorityId) || '-' : '-';
        const categoryBudgetNameFull = project
          ? categoryIdToNameMap.get(project.budgetCategoryId) || project.budgetCategoryId || '-'
          : '-';
        const categoryBudgetAbbrev =
          categoryBudgetNameFull === '-' ? '-' : abbrevBudgetCategoryName(String(categoryBudgetNameFull));
        const projectBudget = project ? (project.approvedBudget > 0 ? project.approvedBudget : project.budgetPlan) : 0;
        const budgetActual = project?.consumedBudget || 0;

        const rowPeriod = project?.periodName || (effectivePeriods.length === 1 ? effectivePeriods[0] : '-');

        return {
          No: index + 1,
          ...(effectivePeriods.length > 1 ? { 'Budget Period': rowPeriod } : {}),
          'Code Asset': asset.assetCode || '-',
          'Budget Category': categoryBudgetAbbrev,
          'Project Name': asset.projectName || '-',
          'Project Type': project?.type || '-',
          'Asset Name': asset.assetName || '-',
          Priority: priorityName,
          'Last Task': exportLastMap.get(normAssetKey(asset.id)) || '-',
          'End Date': formatDate(asset.endTargetDate),
          'Projection Date': formatDate(asset.projectionEndDate),
          'Project Timing': getProjectTimingInfo(asset).label,
          'Project Code': asset.projectCode || '-',
          'Hospital Unit': asset.huName || '-',
          Network: asset.archetypeName || '-',
          'Project Budget': projectBudget,
          'Budget Actual': budgetActual,
          'Completion (%)': Math.round(asset.completionRate || 0),
        };
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      worksheet['!autofilter'] = headers.length > 0
        ? { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` }
        : undefined;
      worksheet['!cols'] = headers.map((header) => {
        const maxContentLength = rows.reduce((max, row) => {
          const value = row[header as keyof typeof row];
          const text = value == null ? '' : String(value);
          return Math.max(max, text.length);
        }, header.length);
        return { wch: Math.min(Math.max(maxContentLength + 2, 10), 45) };
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Capex Project List');

      const safePeriod = (queryPeriodKey || 'all-period').replace(/[^a-z0-9-_]/gi, '_');
      const dateTag = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `capex_project_list_${safePeriod}_${dateTag}.xlsx`);
      showToast(`Export ${exportAssets.length.toLocaleString('id-ID')} baris berhasil.`, 'success');
    } catch (err) {
      console.warn('Export failed:', err);
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor Excel.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [
    effectivePeriods,
    queryPeriodKey,
    allCategories,
    refreshMasterConfig,
    currentUser,
    capexBeUrl,
    footerTotalCount,
    serverFilters,
    priorities,
    showToast,
    isExporting,
    clientFilterCanServe,
    clientListFilters,
    clientFilterPoolRef,
    permissions.userScopes,
    userScopesReady,
    useBff,
  ]);
  
  const selectedProject = useMemo(() => {
    if (!selectedAsset) return null;
    const projectId = String(selectedAsset.projectId ?? '').trim();
    if (!projectId) return null;
    return (
      tableProjectsForColumns.find((p) => String(p.id) === projectId) ??
      allProjects.find((p) => String(p.id) === projectId) ??
      null
    );
  }, [selectedAsset, tableProjectsForColumns, allProjects]);

  const handleOpenWhatsAppReminder = useCallback((payload: WhatsAppReminderPayload) => {
    if (!selectedAsset || !currentUser) return;

    const task = allTasks.find((item) => item.id === payload.taskId);
    const recipients = resolveWhatsAppRecipients(
      masterData.users,
      payload.assignedRoleNames,
      selectedAsset.huName,
    );
    const message = buildWhatsAppReminderMessage({
      taskName: payload.taskName,
      taskDescription: task?.description,
      project: selectedProject,
      asset: selectedAsset,
      currentUser,
    });
    const result = openWhatsAppReminder({ message, recipients });

    if (result.mode === 'direct' && result.recipient) {
      showToast(`Membuka WhatsApp ke ${result.recipient.username}.`, 'success');
      return;
    }

    if (recipients.length === 0) {
      showToast('Tidak ada user dengan role & scope ini. Pilih penerima di WhatsApp.');
      return;
    }

    showToast('Nomor WhatsApp tidak tersedia. Pilih penerima di WhatsApp.');
  }, [selectedAsset, selectedProject, currentUser, allTasks, masterData.users, showToast]);

  const syncSourceDataAfterEdit = useCallback((nextAsset?: EnrichedAsset, nextProject?: Project) => {
    if (!sourceDataRef.current || !currentUser || !primaryPeriodName.trim()) return;
    const cachePeriod = primaryPeriodName.trim();
    const src = sourceDataRef.current;
    const updatedAssets = nextAsset
      ? src.assets.map(a => (normAssetKey(a.id) === normAssetKey(nextAsset.id) ? { ...a, ...nextAsset } : a))
      : src.assets;
    const updatedProjects = nextProject
      ? src.projects.map(p => (p.id === nextProject.id ? { ...p, ...nextProject } : p))
      : src.projects;
    const nextSource = { ...src, assets: updatedAssets, projects: updatedProjects };
    sourceDataRef.current = nextSource;
    sourceDataByPeriodRef.current.set(getPeriodUserKey(currentUser.id, cachePeriod), nextSource);
    if (clientFilterPoolRef.current) {
      clientFilterPoolRef.current = { ...clientFilterPoolRef.current, source: nextSource };
      setClientPoolRevision((n) => n + 1);
    }
    writeProjectListCache(cachePeriod, currentUser.id, {
      enrichedAssets: nextSource.assets,
      projects: nextSource.projects,
      workflows: nextSource.workflows,
      archetypes: nextSource.archetypes,
      hus: nextSource.hus,
      users: nextSource.users,
      priorities: nextSource.priorities,
      allRoles: nextSource.allRoles,
      allTasks: nextSource.allTasks,
      assetLastTaskMap: nextSource.assetLastTaskMap,
      totalAssetCount: nextSource.totalAssetCount,
    });
    if (filtersKey && !isMultiPeriodView) {
      clearProjectListTableCachePage(
        cachePeriod,
        currentUser.id,
        filtersKey,
        currentPage,
        itemsPerPage,
      );
    }
  }, [
    currentUser,
    primaryPeriodName,
    filtersKey,
    currentPage,
    itemsPerPage,
    isMultiPeriodView,
  ]);

  const handleSaveProjectMeta = useCallback(async (updatedProject: Project) => {
    if (!currentUser) return;
    try {
      const savePeriodName = updatedProject.periodName?.trim() || primaryPeriodName;
      const backendSaved = await saveProjectViaBackend(currentUser.id, savePeriodName, updatedProject);
      const projectToPersist = backendSaved ?? updatedProject;
      if (!backendSaved) {
        throw new Error('Gagal menyimpan proyek via backend.');
      }
      setAllProjects(prev => prev.map(p => (p.id === projectToPersist.id ? projectToPersist : p)));
      syncSourceDataAfterEdit(undefined, projectToPersist);
      showToast(
        backendSaved
          ? 'Data proyek tersimpan via Backend (sinkron ke Supabase).'
          : 'Data proyek tersimpan langsung ke Supabase.',
        'success',
        { title: 'Proyek' }
      );
      setIsProjectEditorOpen(false);
    } catch (err) {
      console.error('Failed to update project:', err);
      showToast(
        err instanceof Error ? err.message : 'Tidak dapat menyimpan proyek. Coba lagi.',
        'error',
        { title: 'Proyek' }
      );
    }
  }, [currentUser, primaryPeriodName, showToast, syncSourceDataAfterEdit]);

  const handleSaveAssetMeta = useCallback(async (updatedAsset: Asset) => {
    if (!selectedProject || !currentUser) return;
    try {
      const savePeriodName = selectedProject.periodName?.trim() || primaryPeriodName;
      const normalizedAsset = { ...updatedAsset, projectId: selectedProject.id };
      const backendSaved = await saveAssetViaBackend(currentUser.id, savePeriodName, normalizedAsset);
      const assetToPersist = backendSaved ?? normalizedAsset;
      if (!backendSaved) {
        throw new Error('Gagal menyimpan asset via backend.');
      }
      const nextAsset = selectedAsset
        ? { ...selectedAsset, ...assetToPersist, workflowSetId: assetToPersist.workflowSetId } as EnrichedAsset
        : null;
      if (nextAsset) {
        setAllAssets((prev) => prev.map((a) => (normAssetKey(a.id) === normAssetKey(nextAsset.id) ? nextAsset : a)));
        syncSourceDataAfterEdit(nextAsset);
        const maps = buildAssetFilterMaps(allProjects, priorities, allAssets);
        const stillMatchesFilters =
          filterEnrichedAssets([nextAsset], maps, assetLastTaskMap, {
            searchLower: appliedSearchTerm.trim().toLowerCase(),
            selectedHUs,
            selectedPriorities,
            selectedFinishedTasks,
            selectedBudgetFilter,
            selectedBudgetCategoryIds,
            completionRange,
            meetingFilters,
            assetTypeGroupMaps: assetTypeGroupMaster,
            archetypeByHuName,
          }).length > 0;
        if (isAssetCancelledForProjectList(nextAsset) || !stillMatchesFilters) {
          if (!stillMatchesFilters && !isAssetCancelledForProjectList(nextAsset)) {
            showToast('Aset tidak lagi cocok dengan filter aktif.', 'success', { title: 'Filter' });
          }
          setSelectedAssetId(null);
        } else {
          setSelectedAssetId(String(nextAsset.id));
        }
      }
      showToast(
        backendSaved
          ? 'Data aset tersimpan via Backend (sinkron ke Supabase).'
          : 'Data aset tersimpan langsung ke Supabase.',
        'success',
        { title: 'Aset' }
      );
      setIsAssetEditorOpen(false);
    } catch (err) {
      console.error('Failed to update asset:', err);
      showToast(
        err instanceof Error ? err.message : 'Tidak dapat menyimpan aset. Coba lagi.',
        'error',
        { title: 'Aset' }
      );
    }
  }, [
    selectedProject,
    selectedAsset,
    currentUser,
    primaryPeriodName,
    showToast,
    syncSourceDataAfterEdit,
    allProjects,
    priorities,
    allAssets,
    assetLastTaskMap,
    appliedSearchTerm,
    selectedHUs,
    selectedPriorities,
    selectedFinishedTasks,
    selectedBudgetFilter,
    selectedBudgetCategoryIds,
    completionRange,
    meetingFilters,
    assetTypeGroupMaster,
    archetypeByHuName,
  ]);

  const handleQuickEditTargetDate = useCallback(async () => {
    if (!selectedAsset || !selectedProject) return;
    const nextDate = window.prompt('Input End Target Date (YYYY-MM-DD):', selectedAsset.endTargetDate || '');
    if (nextDate == null) return;
    await handleSaveAssetMeta({ ...selectedAsset, endTargetDate: nextDate.trim() || undefined });
  }, [selectedAsset, selectedProject, handleSaveAssetMeta]);

  const handleQuickEditPriority = useCallback(async () => {
    if (!selectedProject) return;
    if (!userCanEditProjectPriority(currentUser)) {
      showToast('Hanya Super Admin atau PMO yang dapat mengubah priority proyek.', 'error', { title: 'Proyek' });
      return;
    }
    const options = priorities.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const picked = window.prompt(`Pilih priority (ketik angka):\n${options}`, '1');
    if (!picked) return;
    const idx = Number(picked) - 1;
    const nextPriority = priorities[idx];
    if (!nextPriority) {
      showToast('Priority tidak valid.', 'error', { title: 'Proyek' });
      return;
    }
    await handleSaveProjectMeta({ ...selectedProject, priorityId: nextPriority.id });
  }, [selectedProject, priorities, showToast, handleSaveProjectMeta, currentUser]);

  const handleInlinePriorityChange = useCallback(async (projectId: string, newPriorityId: string) => {
    if (!userCanEditProjectPriority(currentUser)) return;
    const project = allProjects.find(p => String(p.id) === String(projectId));
    if (!project || project.priorityId === newPriorityId) return;
    setSavingPriorityProjectId(String(projectId));
    try {
      await handleSaveProjectMeta({ ...project, priorityId: newPriorityId });
    } finally {
      setSavingPriorityProjectId(null);
    }
  }, [allProjects, handleSaveProjectMeta, currentUser]);

  const projectPriorityNameMap = useMemo(() => {
    const priorityIdToName = new Map(priorities.map((p) => [String(p.id), p.name] as [string, string]));
    return new Map(
      tableProjectsForColumns.map(
        (p) => [String(p.id), priorityIdToName.get(String(p.priorityId)) || '–'] as [string, string],
      ),
    );
  }, [tableProjectsForColumns, priorities]);

  const projectByIdForColumns = useMemo(
    () => new Map(tableProjectsForColumns.map((p) => [String(p.id), p] as [string, Project])),
    [tableProjectsForColumns],
  );

  const categoryIdToName = useMemo(
    () => new Map(allCategories.map((c) => [String(c.id), c.name] as [string, string])),
    [allCategories],
  );

  const budgetCategoryFilterOptions = useMemo(
    () => allCategories.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name })),
    [allCategories],
  );

  const handleAssetCodeSort = useCallback(() => {
    setSortBy((prev) => (prev === 'assetCode_asc' ? 'assetCode_desc' : 'assetCode_asc'));
    setCurrentPage(1);
  }, []);

  const assetColumns = useMemo(
    () =>
      buildCapexProjectListColumns({
        isMultiPeriodView,
        sortBy,
        onAssetCodeSort: handleAssetCodeSort,
        projectById: projectByIdForColumns,
        categoryIdToName,
        projectPriorityNameMap,
        assetLastTaskMap: tableLastTaskMapForColumns,
        canEditPriority,
        priorities,
        savingPriorityProjectId,
        onInlinePriorityChange: handleInlinePriorityChange,
      }),
    [
      isMultiPeriodView,
      sortBy,
      handleAssetCodeSort,
      projectByIdForColumns,
      categoryIdToName,
      projectPriorityNameMap,
      tableLastTaskMapForColumns,
      canEditPriority,
      priorities,
      savingPriorityProjectId,
      handleInlinePriorityChange,
    ],
  );

  const availableFilterArchetypes = useMemo(
    () =>
      buildScopedArchetypeOptions(
        masterData.archetypes,
        permissions.userScopes,
        masterData.hus,
      ),
    [masterData.archetypes, masterData.hus, permissions.userScopes],
  );

  useEffect(() => {
    if (
      meetingFilters.archetype &&
      availableFilterArchetypes.length > 0 &&
      !availableFilterArchetypes.some(
        (name) => normFilterName(name) === normFilterName(meetingFilters.archetype),
      )
    ) {
      handleMeetingFilterChange({ archetype: null, assetTypeGroup: meetingFilters.assetTypeGroup });
    }
  }, [meetingFilters.archetype, meetingFilters.assetTypeGroup, availableFilterArchetypes, handleMeetingFilterChange]);

  useEffect(() => {
    if (
      meetingFilters.assetTypeGroup &&
      assetTypeGroupFilterOptions.length > 0 &&
      !assetTypeGroupFilterOptions.some(
        (name) => normFilterName(name) === normFilterName(meetingFilters.assetTypeGroup),
      )
    ) {
      handleMeetingFilterChange({ archetype: meetingFilters.archetype, assetTypeGroup: null });
    }
  }, [
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    assetTypeGroupFilterOptions,
    handleMeetingFilterChange,
  ]);

  const availableFilterHUs = useMemo(() => {
    let filteredHUs = masterData.hus;

    // 1) Filter by selected Archetype (top bar)
    const selectedArchetypeConfig = meetingFilters.archetype
      ? masterData.archetypes.find(
          (a) => normFilterName(a.name) === normFilterName(meetingFilters.archetype),
        ) || null
      : null;
    if (selectedArchetypeConfig) {
      filteredHUs = filteredHUs.filter(
        (hu) =>
          String(hu.archetypeId ?? (hu as { archetype_id?: string }).archetype_id) ===
          String(selectedArchetypeConfig.id),
      );
    }

    if (permissions.userScopes.all) return filteredHUs;

    // Same effective scope as asset list (names + IDs from assignments → names via master data)
    const archetypeIdToName = new Map(masterData.archetypes.map(a => [a.id, a.name] as [string, string]));
    const huIdToName = new Map(masterData.hus.map(h => [h.id, h.name] as [string, string]));
    const effectiveScopedArchetypeNames = new Set<string>([
      ...Array.from(permissions.userScopes.archetypes),
      ...Array.from(permissions.userScopes.archetypeIds).map(id => archetypeIdToName.get(id)).filter((n): n is string => !!n),
    ]);
    const effectiveScopedHuNames = new Set<string>([
      ...Array.from(permissions.userScopes.hus),
      ...Array.from(permissions.userScopes.huIds).map(id => huIdToName.get(id)).filter((n): n is string => !!n),
    ]);

    return filteredHUs.filter(hu => {
      if (effectiveScopedHuNames.has(hu.name)) return true;
      const archName = archetypeIdToName.get(hu.archetypeId);
      return !!archName && effectiveScopedArchetypeNames.has(archName);
    });
  }, [masterData.hus, masterData.archetypes, permissions.userScopes, meetingFilters.archetype]);

  const huNamesInScope = useMemo(
    () => availableFilterHUs.map(h => h.name).filter(n => !!n?.trim()),
    [availableFilterHUs],
  );

  const huFilterOptions = useMemo(() => huNamesInScope, [huNamesInScope]);

  useEffect(() => {
    if (!userScopesReady || permissions.userScopes.all) return;
    const allowed = new Set(huNamesInScope.map((name) => normFilterName(name)));
    setSelectedHUs((prev) => {
      if (prev.length === 0) return prev;
      const valid = prev.filter((name) => allowed.has(normFilterName(name)));
      return valid.length === prev.length ? prev : valid;
    });
  }, [userScopesReady, permissions.userScopes.all, huNamesInScope]);

  const priorityFilterOptions = useMemo(
    () => priorities.filter((p) => p.isActive).map((p) => p.name),
    [priorities],
  );

  const hasMobileActiveFilters = useMemo(
    () =>
      Boolean(appliedSearchTerm) ||
      selectedHUs.length > 0 ||
      selectedPriorities.length > 0 ||
      selectedFinishedTasks.length > 0 ||
      selectedBudgetCategoryIds.length > 0,
    [
      appliedSearchTerm,
      selectedHUs.length,
      selectedPriorities.length,
      selectedFinishedTasks.length,
      selectedBudgetCategoryIds.length,
    ],
  );

  const currentRunningPeriod = useMemo(
    () => pickLatestBudgetPeriodName(resolvedBudgetPeriods) || periodName.trim(),
    [resolvedBudgetPeriods, periodName],
  );

  const hasActivePanelFilters = useMemo(() => {
    const periodActive = isProjectListPeriodFilterActive(
      selectedPeriods,
      currentRunningPeriod,
      availablePeriodOptions,
    );
    const otherFiltersActive =
      Boolean(appliedSearchTerm.trim()) ||
      selectedHUs.length > 0 ||
      selectedPriorities.length > 0 ||
      selectedFinishedTasks.length > 0 ||
      selectedBudgetFilter != null ||
      selectedBudgetCategoryIds.length > 0 ||
      completionRange.min > 0 ||
      completionRange.max < 100 ||
      meetingFilters.archetype != null ||
      meetingFilters.assetTypeGroup != null;
    return periodActive || otherFiltersActive;
  }, [
    selectedPeriods,
    currentRunningPeriod,
    availablePeriodOptions,
    appliedSearchTerm,
    selectedHUs.length,
    selectedPriorities.length,
    selectedFinishedTasks.length,
    selectedBudgetFilter,
    selectedBudgetCategoryIds.length,
    completionRange.min,
    completionRange.max,
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
  ]);

  const showInitialTableLoading =
    paginatedAssets.length === 0 &&
    !tableQuery.isPlaceholderData &&
    (tableQuery.isPending || tableQuery.isFetching) &&
    Boolean(capexBeUrl);

  const isPageLoading = isPageTransition;

  const handlePageChange = useCallback(
    (page: number) => {
      if (page === currentPage) return;
      resetAppliedTableCacheKeys();
      clearTableRows({ keepTotal: true });
      setSelectedAssetId(null);
      setCurrentPage(page);
    },
    [currentPage, resetAppliedTableCacheKeys, clearTableRows, setCurrentPage],
  );

  const handleItemsPerPageChange = useCallback(
    (size: number) => {
      resetAppliedTableCacheKeys();
      clearTableRows({ keepTotal: true });
      setSelectedAssetId(null);
      setItemsPerPage(size);
      setCurrentPage(1);
    },
    [resetAppliedTableCacheKeys, clearTableRows, setItemsPerPage, setCurrentPage],
  );

  const huEmptySelectionLabel = useMemo(() => {
    const n = huNamesInScope.length;
    if (permissions.userScopes.all) {
      return n > 0 ? `All units (${n})` : 'All units';
    }
    if (n === 0) return 'No units in your scope';
    if (n === 1) return huNamesInScope[0] ?? '1 unit';
    return `All in your scope (${n} units)`;
  }, [permissions.userScopes.all, huNamesInScope]);

  // HU prune on archetype change: handled synchronously in handleMeetingFilterChange

  // Extract unique completed tasks for the filter dropdown (full pool when warm)
  const finishedTaskOptions = useMemo(() => {
    const pool = clientFilterPoolRef.current;
    if (pool?.periodKey === queryPeriodKey && pool.source.assetLastTaskMap) {
      return Array.from(new Set(Object.values(pool.source.assetLastTaskMap))).sort();
    }
    return Array.from(new Set(assetLastTaskMap.values())).sort();
  }, [assetLastTaskMap, clientPoolRevision, queryPeriodKey]);

  const isSuperAdmin = !!currentUser?.assignments?.some((a) => a.roleName === 'Super Admin');
  const canEditProjectMeta = permissions.isAllowed('Project', 'edit') || isSuperAdmin;
  const canEditAssetMeta = permissions.isAllowed('Asset', 'edit') || isSuperAdmin;
  const canEditPriorityOnProject = userCanEditProjectPriority(currentUser);
  const canShowActionMenu = canEditProjectMeta || canEditAssetMeta || canEditPriorityOnProject;
  const canManageAssetTasks = canEditProjectMeta || canEditAssetMeta || isSuperAdmin;

  const tourReady =
    !!currentUser &&
    canView &&
    userScopesReady &&
    !tableQuery.isPending;

  const tourSteps = useMemo(
    () =>
      buildCapexProjectListTourSteps({
        hasPeriodFilter: availablePeriodOptions.length > 0,
        canManageTasks: canManageAssetTasks,
      }),
    [availablePeriodOptions.length, canManageAssetTasks],
  );

  const { isTourOpen, steps, startTour, handleTourClose } = usePageTour({
    userId: currentUser?.id ?? 0,
    tourId: CAPEX_PROJECT_LIST_TOUR_ID,
    tourVersion: CAPEX_PROJECT_LIST_TOUR_VERSION,
    ready: tourReady && !!currentUser,
    steps: tourSteps,
  });

  const handleCloseDetail = useCallback(() => setSelectedAssetId(null), []);
  const handleCloseMomModal = useCallback(() => {
    setMomModalOpen(false);
    setMomEditTarget(null);
  }, []);
  const handleMomAdded = useCallback(() => {
    if (selectedAsset) invalidateAssetTimelineCache(selectedAsset.id);
    setTimelineRefreshNonce((n) => n + 1);
    handleTaskUpdate(selectedAsset?.id);
    setMomEditTarget(null);
  }, [selectedAsset, handleTaskUpdate]);
  const handleAdhocTaskAdded = useCallback(() => {
    if (selectedAsset) invalidateAssetTimelineCache(selectedAsset.id);
    setTimelineRefreshNonce((n) => n + 1);
    handleTaskUpdate(selectedAsset?.id);
  }, [selectedAsset, handleTaskUpdate]);
  const handleAddMomFromSummary = useCallback(() => {
    setMomEditTarget(null);
    setMomModalOpen(true);
  }, []);
  const handleEditMom = useCallback((mom: MOM) => {
    setMomEditTarget(mom);
    setMomModalOpen(true);
  }, []);
  const handleOpenProjectEditor = useCallback(() => {
    if (!selectedProject) {
      showToast('Data proyek belum tersedia. Coba tutup panel lalu pilih asset lagi.', 'error', { title: 'Proyek' });
      return;
    }
    refreshMasterConfig();
    setIsProjectEditorOpen(true);
  }, [refreshMasterConfig, selectedProject, showToast]);
  const handleOpenAssetEditor = useCallback(() => {
    if (!selectedAsset) return;
    refreshMasterConfig();
    setIsAssetEditorOpen(true);
  }, [refreshMasterConfig, selectedAsset]);
  const handleSaveProjectFromModal = useCallback(
    (project: Project) => { void handleSaveProjectMeta(project); },
    [handleSaveProjectMeta],
  );
  const handleSaveAssetFromModal = useCallback(
    (asset: Asset) => { void handleSaveAssetMeta(asset); },
    [handleSaveAssetMeta],
  );

  const handleTriggerTaskDataSave = useCallback(
    async (params: Omit<ProjectListTriggerTaskSaveParams, 'currentUser' | 'periodName'>) => {
      if (!currentUser) {
        throw new Error('Sesi pengguna tidak valid.');
      }
      const savePeriodName =
        params.project.periodName?.trim() || primaryPeriodName.trim() || periodName.trim();
      if (!savePeriodName) {
        throw new Error('Budget period tidak ditemukan.');
      }

      const { asset: savedAsset, project: savedProject } = await handleProjectListTriggerTaskSave({
        ...params,
        currentUser,
        periodName: savePeriodName,
      });

      const mapKey = normAssetKey(savedAsset.id);
      setAllAssets((prev) =>
        prev.map((a) => (normAssetKey(a.id) === mapKey ? { ...a, ...savedAsset } : a)),
      );
      setAllProjects((prev) =>
        prev.map((p) => (String(p.id) === String(savedProject.id) ? { ...p, ...savedProject } : p)),
      );
      syncSourceDataAfterEdit(savedAsset, savedProject);
      invalidateAssetTimelineCache(savedAsset.id);
      handleTaskUpdate(String(savedAsset.id));
      setTimelineRefreshNonce((n) => n + 1);
    },
    [
      currentUser,
      primaryPeriodName,
      periodName,
      syncSourceDataAfterEdit,
      handleTaskUpdate,
    ],
  );
  const handleOpenTimelineModal = useCallback(() => setIsTimelineModalOpen(true), []);
  const handleCloseTimelineModal = useCallback(() => setIsTimelineModalOpen(false), []);
  const handleOpenSummaryModal = useCallback(() => setIsSummaryModalOpen(true), []);
  const handleCloseSummaryModal = useCallback(() => setIsSummaryModalOpen(false), []);
  const handleOpenActionPopup = useCallback(() => setIsActionPopupOpen(true), []);
  const handleCloseActionPopup = useCallback(() => setIsActionPopupOpen(false), []);
  const handleOpenMomModal = useCallback(() => setMomModalOpen(true), []);
  const handleCloseAdhocModal = useCallback(() => setAdhocTaskModalOpen(false), []);
  const handleOpenAdhocModal = useCallback(() => setAdhocTaskModalOpen(true), []);
  const handleCloseProjectEditor = useCallback(() => setIsProjectEditorOpen(false), []);
  const handleCloseAssetEditor = useCallback(() => setIsAssetEditorOpen(false), []);

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  return (
    <div className="md:flex h-full bg-siloam-surface rounded-xl shadow-soft overflow-hidden">
      {/* Master Panel */}
      <div className={`
          w-full flex-col transition-all duration-300 ease-in-out
          md:border-r md:border-siloam-border
          ${selectedAssetId ? 'hidden md:flex md:w-1/2 lg:w-2/3' : 'flex md:w-full'}
      `}>
        <div
          data-tour="cpl-page-intro"
          className="flex justify-between items-center gap-3 px-4 pt-3 pb-2 bg-siloam-surface border-b border-siloam-border"
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-siloam-text-primary">Capex Project List</h2>
            <p className="text-xs text-siloam-text-secondary truncate">
              Lacak asset, workflow, dan progress project
              {isAllBudgetPeriodsSelected(selectedPeriods, availablePeriodOptions)
                ? ` · ${availablePeriodOptions.length} budget period`
                : effectivePeriods.length > 1
                  ? ` · ${effectivePeriods.length} budget period`
                  : effectivePeriods.length === 1
                    ? ` · ${effectivePeriods[0]}`
                    : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={startTour}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-siloam-border px-3 py-2 text-sm font-medium text-siloam-text-secondary transition hover:bg-siloam-bg hover:text-siloam-text-primary"
              aria-label="Buka panduan halaman Capex Project List"
            >
              <HelpCircle className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Panduan</span>
            </button>
          </div>
        </div>
        <div data-tour="cpl-asset-filters">
          <AssetFilterPanel
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSearchSubmit={handleSearchSubmit}
            onSearchReset={handleSearchReset}
            onFilterPanelOpen={refreshMasterConfig}
            toolbarLeading={
              canManageAssetTasks ? (
                <button
                  type="button"
                  data-tour="cpl-quick-task"
                  onClick={() => setIsQuickTaskDoneModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                  aria-label="Quick edit task"
                >
                  <Zap className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Quick Task</span>
                </button>
              ) : null
            }
            periodOptions={availablePeriodOptions}
            selectedPeriods={selectedPeriods}
            setSelectedPeriods={handlePeriodFilterChange}
            huOptions={huFilterOptions}
            huEmptySelectionLabel={huEmptySelectionLabel}
            selectedHUs={selectedHUs}
            setSelectedHUs={handleHUFilterChange}
            completionRange={completionRange}
            setCompletionRange={handleCompletionRangeChange}
            priorityOptions={priorityFilterOptions}
            selectedPriorities={selectedPriorities}
            setSelectedPriorities={handlePriorityFilterChange}
            finishedTaskOptions={finishedTaskOptions}
            selectedFinishedTasks={selectedFinishedTasks}
            setSelectedFinishedTasks={handleFinishedTaskFilterChange}
            selectedBudgetFilter={selectedBudgetFilter}
            setSelectedBudgetFilter={handleBudgetProjectFilterChange}
            budgetCategoryOptions={budgetCategoryFilterOptions}
            selectedBudgetCategoryIds={selectedBudgetCategoryIds}
            setSelectedBudgetCategoryIds={handleBudgetCategoryFilterChange}
            archetypeOptions={availableFilterArchetypes}
            assetTypeGroupOptions={assetTypeGroupFilterOptions}
            selectedArchetype={meetingFilters.archetype}
            selectedAssetTypeGroup={meetingFilters.assetTypeGroup}
            onMeetingFilterChange={handleMeetingFilterChange}
            hasActiveFilters={hasActivePanelFilters}
            defaultSelectedPeriods={currentRunningPeriod ? [currentRunningPeriod] : []}
          />
        </div>
        <CapexProjectListTableBlock
          columns={assetColumns}
          paginatedAssets={tableAssets}
          selectedAssetId={selectedAssetId}
          onRowClick={handleRowClick}
          onRowHover={handleRowHover}
          showInitialLoading={showInitialTableLoading || isPageLoading}
          isFilterRefreshing={isFilterRefreshing}
          isSearchActive={isSearchActive}
          isBackgroundRefresh={isBackgroundRefresh}
          isPageTransition={isPageTransition}
          hasActiveFilters={hasMobileActiveFilters}
          footerTotalCount={footerTotalCount}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalPages={totalPages}
          isExporting={isExporting}
          onExportExcel={handleExportExcel}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>

      <div
        className={`
          w-full h-full flex-col transition-all duration-300 ease-in-out
          md:w-0
          ${selectedAssetId ? 'flex md:w-1/2 lg:w-1/3' : 'hidden'}
        `}
      >
        {selectedAssetId && selectedAsset && currentUser ? (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-siloam-text-secondary">
                Memuat detail…
              </div>
            }
          >
            <CapexProjectListDetailPanel
            selectedAsset={selectedAsset}
            selectedProject={selectedProject}
            currentUser={currentUser}
            allRoles={allRoles}
            allWorkflows={allWorkflows}
            masterUsers={masterData.users}
            allCategories={allCategories}
            allAssetTypes={allAssetTypes}
            priorities={priorities}
            timelineRefreshNonce={timelineRefreshNonce}
            isMomModalOpen={isMomModalOpen}
            momEditTarget={momEditTarget}
            isAdhocTaskModalOpen={isAdhocTaskModalOpen}
            isTimelineModalOpen={isTimelineModalOpen}
            isActionPopupOpen={isActionPopupOpen}
            isProjectEditorOpen={isProjectEditorOpen}
            isAssetEditorOpen={isAssetEditorOpen}
            isSummaryModalOpen={isSummaryModalOpen}
            canManageAssetTasks={canManageAssetTasks}
            canShowActionMenu={canShowActionMenu}
            canEditProjectMeta={canEditProjectMeta}
            canEditAssetMeta={canEditAssetMeta}
            canEditPriorityOnProject={canEditPriorityOnProject}
            onClose={handleCloseDetail}
            onOpenTimelineModal={handleOpenTimelineModal}
            onOpenSummaryModal={handleOpenSummaryModal}
            onOpenActionPopup={handleOpenActionPopup}
            onCloseActionPopup={handleCloseActionPopup}
            onOpenMomModal={handleOpenMomModal}
            onCloseMomModal={handleCloseMomModal}
            onOpenAdhocModal={handleOpenAdhocModal}
            onCloseAdhocModal={handleCloseAdhocModal}
            onCloseTimelineModal={handleCloseTimelineModal}
            onCloseSummaryModal={handleCloseSummaryModal}
            onCloseProjectEditor={handleCloseProjectEditor}
            onCloseAssetEditor={handleCloseAssetEditor}
            onTaskUpdate={handleTaskUpdate}
            onWhatsAppReminder={handleOpenWhatsAppReminder}
            onMomAdded={handleMomAdded}
            onTaskAdded={handleAdhocTaskAdded}
            onEditMom={handleEditMom}
            onAddMomFromSummary={handleAddMomFromSummary}
            onQuickEditTargetDate={handleQuickEditTargetDate}
            onQuickEditPriority={handleQuickEditPriority}
            onOpenProjectEditor={handleOpenProjectEditor}
            onOpenAssetEditor={handleOpenAssetEditor}
            onSaveProject={handleSaveProjectFromModal}
            onSaveAsset={handleSaveAssetFromModal}
            onTriggerDataSave={handleTriggerTaskDataSave}
          />
          </Suspense>
        ) : null}
      </div>

      <PageTourOverlay steps={steps} isOpen={isTourOpen} onClose={handleTourClose} />

      {currentUser && canManageAssetTasks ? (
        <QuickTaskDoneModal
          isOpen={isQuickTaskDoneModalOpen}
          onClose={() => setIsQuickTaskDoneModalOpen(false)}
          onSuccess={(assetIds) => {
            const n = assetIds.length;
            showToast(
              n === 1 ? '1 task berhasil diselesaikan.' : `${n} task berhasil diselesaikan.`,
              'success',
              { title: 'Quick Task' },
            );
            assetIds.forEach((id) => handleTaskUpdate(id));
            setTimelineRefreshNonce((prev) => prev + 1);
          }}
          currentUser={currentUser}
          lookupAssets={assetsForQuickTaskLookup}
          resolveAssetByCode={resolveAssetByCodeForQuickTask}
          allWorkflows={allWorkflows}
          allTasks={allTasks}
          allRoles={allRoles}
          initialAssetCode={selectedAsset?.assetCode ?? ''}
        />
      ) : null}
    </div>
  );
};

CapexProjectListPageInner.displayName = 'CapexProjectListPage';

export const CapexProjectListPage = memo(CapexProjectListPageInner);
