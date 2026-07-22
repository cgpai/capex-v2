'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
  memo,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { updateBudgetPeriod, recalculateBudgets } from '../services/budgetService';
import {
  BudgetPeriod,
  Project,
  BudgetCategoryConfig,
  User,
  UserRole,
  Asset,
  BudgetSummaryRow,
  ChangeSummary,
  ProjectPriorityConfig,
  PIPELINE_ARCHETYPE_ID,
  WorkflowSet,
  AssetTypeConfig,
  FeasibilityStudy,
  ProjectStatus,
  ProjectType,
  Page,
} from '../types';
import { SpreadsheetColumn } from '../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { usePermissions } from '../hooks/usePermissions';
import { RoutineAssetCard } from '../components/organisms/RoutineAssetCard/RoutineAssetCard';
import { DeleteProjectConfirmModal } from '../components/organisms/DeleteProjectConfirmModal/DeleteProjectConfirmModal';
import { BudgetSummary } from '../components/organisms/BudgetSummary/BudgetSummary';
import { formatCurrency } from '../lib/formatter';
import { SelectCategoryModal } from '../components/organisms/SelectCategoryModal/SelectCategoryModal';
import { PipelineSummaryCard } from '../components/organisms/PipelineSummaryCard/PipelineSummaryCard';
import * as auditService from '../services/auditService';
import { saveBudgetHuViaBackend, allocateProjectCodeViaBackend, allocateAssetCodeViaBackend } from '../services/capexCrudApi';
import { useBackendSession } from '../lib/auth/authConstants';
import { invalidateBudgetHuBackendCache, type BudgetHuPageBundle } from '../services/budgetHuPageApi';
import { invalidateRequestCache } from '../lib/requestCache';
import { yyFromPeriodName } from '../utils/projectCodeUtils';
import { newAssetId } from '../utils/assetCodeUtils';
import { queryKeys } from '../lib/query-keys';
import { resolveDefaultRegularPriorityId, userCanEditProjectPriority } from '../lib/projectPriorityPolicy';
import { buildBudgetHuProjectColumns } from './BudgetHU/buildBudgetHuProjectColumns';
import { useBudgetHuColumnVisibility } from './BudgetHU/useBudgetHuColumnVisibility';
import type { BudgetHuTableColumnId } from './BudgetHU/budgetHuTableColumnIds';
import * as fsService from '../services/fsService';
import { fetchBudgetHuProjectsForExport } from '../services/fetchBudgetArchetypeProjectsForExport';
import * as taskService from '../services/taskService';
import { cloneDeep } from '../lib/clone';
import { useDebouncedValue } from './BudgetHU/useDebouncedValue';
import { useBudgetHuPagePipeline } from './BudgetHU/useBudgetHuPagePipeline';
import { BudgetHUPageSkeleton } from './BudgetHU/BudgetHUPageSkeleton';
import { BudgetHuStrategicProjectsSection } from './BudgetHU/BudgetHuStrategicProjectsSection';
import {
  buildBudgetHuSummaryRows,
  findHuContainer,
  getSelectedHU,
  splitHuProjects,
  filterRegularProjects,
  dedupeProjectsById,
  dedupeHuProjectsInPeriod,
  sortAssetsByCode,
} from './BudgetHU/budgetHuHelpers';
import {
  buildBudgetHuPartialSavePeriod,
  collectBudgetHuSaveChanges,
  applySavedCodeRemaps,
} from './BudgetHU/budgetHuSaveHelpers';
import { PageTourOverlay } from '../features/onboarding/PageTourOverlay';
import { useBudgetHuTour } from '../features/onboarding/useBudgetHuTour';
import { HelpCircle } from 'lucide-react';
import {
  invalidateBudgetHuDiskCache,
  writeBudgetPeriodCache,
} from '../lib/budgetHuDiskCache';

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

const AssetEditorModal = lazy(() =>
  import('../components/organisms/AssetEditorModal/AssetEditorModal').then((m) => ({
    default: m.AssetEditorModal,
  })),
);
const ProjectAssetsModal = lazy(() =>
  import('../components/organisms/ProjectAssetsModal/ProjectAssetsModal').then((m) => ({
    default: m.ProjectAssetsModal,
  })),
);
const MassAddOrEditProjectsModal = lazy(() =>
  import('../components/organisms/MassAddOrEditProjectsModal/MassAddOrEditProjectsModal').then((m) => ({
    default: m.MassAddOrEditProjectsModal,
  })),
);
const ProjectPipelinePage = lazy(() =>
  import('./ProjectPipelinePage/ProjectPipelinePage').then((m) => ({
    default: m.ProjectPipelinePage,
  })),
);
const UnitPerformanceModal = lazy(() =>
  import('../components/organisms/UnitPerformanceModal/UnitPerformanceModal').then((m) => ({
    default: m.UnitPerformanceModal,
  })),
);
const FSProposalModal = lazy(() =>
  import('../components/organisms/FSProposalModal/FSProposalModal').then((m) => ({
    default: m.FSProposalModal,
  })),
);

const InsightsIcon = memo(function InsightsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v.008H9v-.008zm0 3v.008H9v-.008zm0 3v.008H9v-.008zm3-6v.008h.008V11.25zm0 3v.008h.008V14.25zm0 3v.008h.008V17.25z" />
    </svg>
  );
});

interface BudgetHUPageProps {
  periodName: string;
  archetypeId: string | null;
  huId: string | null;
  currentUser: User;
  allRoles: UserRole[];
  allUsers: User[];
  /**
   * Bundle HU dari session/localStorage, dibaca sinkron di App.
   * Membuat paint pertama berisi data (tanpa menunggu useLayoutEffect).
   */
  preloadedBudgetHuPage?: BudgetHuPageBundle | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onDataChange: () => void;
  onBudgetPeriodSaved?: (next: BudgetPeriod) => void;
  currentBudgetPeriod?: BudgetPeriod | null;
}

const BudgetHUPageInner: React.FC<BudgetHUPageProps> = ({
  periodName,
  archetypeId,
  huId,
  currentUser,
  allRoles,
  allUsers,
  preloadedBudgetHuPage,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
  onBudgetPeriodSaved,
  currentBudgetPeriod,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.BudgetHU, 'view');
  const canCreateFS = permissions.isAllowed('FS Update', 'create');

  const [isDirty, setIsDirtyInternal] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const {
    editedData,
    setEditedData,
    serverPeriodRef,
    displayPeriod,
    remoteBundle,
    configSource,
    isInitialLoad,
    bootstrapReady,
    isBackgroundRefresh,
    loadError: error,
    setLoadError: setError,
    assetCountByProjectId,
  } = useBudgetHuPagePipeline({
    queryClient,
    periodName,
    huId,
    userId: currentUser.id,
    canView,
    isDirtyRef,
    updateIsDirty,
    currentBudgetPeriod,
    preloadedBudgetHuPage,
  });

  const editedDataRef = useRef(editedData);
  editedDataRef.current = editedData;

  const [isSaving, setIsSaving] = useState(false);

  const [isAssetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedProjectForAssets, setSelectedProjectForAssets] = useState<Project | null>(null);
  const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
  const [isSelectingCategory, setIsSelectingCategory] = useState(false);
  const [isMassEditOrAddModalOpen, setIsMassEditOrAddModalOpen] = useState(false);
  const [isSummaryCompact, setIsSummaryCompact] = useState(true);
  const [isPipelineSectionExpanded, setIsPipelineSectionExpanded] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [selectedProjectForFS, setSelectedProjectForFS] = useState<Project | null>(null);
  const [viewFS, setViewFS] = useState<{ project: Project; fs: FeasibilityStudy } | null>(null);
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  const routineAssetMaxBudget =
    configSource?.routineAssetMaxBudget ?? remoteBundle?.routineAssetMaxBudget ?? 0;
  const allCategories = configSource?.categories?.length
    ? configSource.categories
    : (remoteBundle?.categories ?? []);
  const allPriorities = configSource?.priorities?.length
    ? configSource.priorities
    : (remoteBundle?.priorities ?? []);
  const allWorkflows = configSource?.workflows?.length
    ? configSource.workflows
    : (remoteBundle?.workflows ?? []);
  const allAssetTypes = useMemo(() => {
    const raw = configSource?.assetTypes?.length
      ? configSource.assetTypes
      : (remoteBundle?.assetTypes ?? []);
    return raw.filter((at) => at.isActive);
  }, [configSource?.assetTypes, remoteBundle?.assetTypes]);

  const activeCategories = useMemo(() => allCategories.filter((c) => c.isActive), [allCategories]);

  // Clean-session data comes only from useBudgetHuPagePipeline.applyPageBundle
  // (server truth). Do not re-merge disk / shell "richer" trees here — that kept
  // stale project codes (e.g. SHSS.28.x) and blocked peer sync.

  useEffect(() => {
    updateIsDirty(false);
    setCurrentPage(1);
    setSearchTerm('');
    setIsPipelineSectionExpanded(false);
  }, [huId, archetypeId, periodName, updateIsDirty]);

  const selectedHU = useMemo(
    () => getSelectedHU(displayPeriod, huId, archetypeId),
    [displayPeriod, huId, archetypeId],
  );

  /** Prefer unit `isPipeline` tag from master data; keep PIPE archetype as legacy fallback. */
  const isPipelineHU = useMemo(() => {
    if (archetypeId === PIPELINE_ARCHETYPE_ID) return true;
    if (selectedHU?.isPipeline) return true;
    // Stale disk/edited trees can omit isPipeline; check fresh remote + App shell structure.
    const fromRemote = remoteBundle?.budgetPeriod
      ? getSelectedHU(remoteBundle.budgetPeriod, huId, archetypeId)?.isPipeline
      : undefined;
    if (fromRemote) return true;
    const fromShell = currentBudgetPeriod
      ? getSelectedHU(currentBudgetPeriod, huId, archetypeId)?.isPipeline
      : undefined;
    return Boolean(fromShell);
  }, [
    archetypeId,
    selectedHU?.isPipeline,
    remoteBundle?.budgetPeriod,
    currentBudgetPeriod,
    huId,
  ]);

  const { routineAssetProject, regularProjects, pipelineProjects } = useMemo(
    () => splitHuProjects(selectedHU),
    [selectedHU],
  );

  const filteredProjects = useMemo(
    () => filterRegularProjects(regularProjects, debouncedSearch, allCategories),
    [regularProjects, debouncedSearch, allCategories],
  );

  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProjects.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProjects, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, huId, archetypeId, periodName, itemsPerPage]);

  const fsQuery = useQuery({
    queryKey: queryKeys.budgetHu.fs(periodName, currentUser.id),
    queryFn: () => fsService.getAllFeasibilityStudies({ userId: currentUser.id }),
    enabled:
      !!periodName &&
      !!selectedHU &&
      regularProjects.length > 0 &&
      !isInitialLoad &&
      !(remoteBundle?.studies && remoteBundle.studies.length > 0),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const fsDataMap = useMemo(() => {
    if (remoteBundle?.studies && remoteBundle.studies.length > 0) {
      return new Map(
        remoteBundle.studies.map((s) => [
          s.projectId,
          { id: s.id, projectId: s.projectId, conclusion: s.conclusion } as FeasibilityStudy,
        ]),
      );
    }
    if (!fsQuery.data) return new Map<string, FeasibilityStudy>();
    return new Map(fsQuery.data.map((fs) => [fs.projectId, fs]));
  }, [remoteBundle?.studies, fsQuery.data]);

  const findHu = useCallback(
    (period: BudgetPeriod) => findHuContainer(period, huId, archetypeId),
    [huId, archetypeId],
  );

  useEffect(() => {
    if (isInitialLoad || !bootstrapReady || !isPipelineHU || pipelineProjects.length > 0 || !editedData || !selectedHU) return;

    let cancelled = false;

    const ensureInitialPipelineStage = async () => {
      let allocated: string | null = null;
      try {
        allocated = await allocateProjectCodeViaBackend({
          userId: currentUser.id,
          periodName: editedData.periodName,
          huCode: selectedHU.code,
        });
      } catch (err) {
        console.error('allocateProjectCodeViaBackend (initial pipeline stage) failed:', err);
      }
      if (cancelled || !allocated) {
        if (!cancelled && !allocated) {
          showToast('Gagal mengalokasikan kode project pipeline awal dari server.', 'error');
        }
        return;
      }

      const year = editedData.periodName.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();

      const newProject: Project = {
        id: `PROJ-${selectedHU.code}-${Date.now()}`,
        projectCode: allocated,
        projectName: 'Pipeline Equipment Stage 1',
        isPipelineProject: true,
        stage: 1,
        pipelineData: [],
        assets: [],
        budgetCategoryId: 'cat-strat-pipe',
        type: ProjectType.ProjectPipeline,
        budgetPlan: 0,
        assetCode: '',
        axCode: '',
        assetName: '',
        completionRate: 0,
        taskToDo: '',
        owner: '',
        targetStart: `${year}-01-01`,
        endDate: `${year}-12-31`,
        status: ProjectStatus.OnTrack,
        plan: 'A',
        budgetCarryForward: 0,
        budgetAllocated: 0,
        approvedBudget: 0,
        consumedBudget: 0,
        revenueProjection: 0,
        priorityId: resolveDefaultRegularPriorityId(allPriorities) || 'prio-must-have',
      };

      const newEditedData = cloneDeep(editedData);
      const huToUpdate = newEditedData.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
      if (huToUpdate) {
        huToUpdate.projects.push(newProject);
        setEditedData(recalculateBudgets(newEditedData));
        updateIsDirty(true);
      }
    };

    void ensureInitialPipelineStage();

    return () => {
      cancelled = true;
    };
  }, [
    isInitialLoad,
    bootstrapReady,
    isPipelineHU,
    pipelineProjects.length,
    editedData,
    selectedHU,
    huId,
    allPriorities,
    updateIsDirty,
    currentUser.id,
    showToast,
  ]);

  const routineProjectEnsuredRef = useRef<string | null>(null);

  useEffect(() => {
    routineProjectEnsuredRef.current = null;
  }, [huId, periodName]);

  useEffect(() => {
    if (isInitialLoad || !bootstrapReady || routineAssetProject || !editedDataRef.current || !selectedHU) return;
    if (!activeCategories.length) return;

    const ensureKey = `${periodName}:${huId}:${activeCategories.length}`;
    if (routineProjectEnsuredRef.current === ensureKey) return;
    routineProjectEnsuredRef.current = ensureKey;

    const editedData = editedDataRef.current;
    const year = editedData.periodName.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();
    const yy = yyFromPeriodName(editedData.periodName);
    const projectCode = `${selectedHU.code}.${yy}.RA`;

    const categoryBudgetPlan: Record<string, number> = {};
    activeCategories.forEach((cat) => {
      categoryBudgetPlan[cat.id] = 0;
    });

    const newProject: Project = {
      id: `PROJ-${selectedHU.code}-${Date.now()}-ROUTINE`,
      projectCode,
      projectName: 'General & Regular Assets',
      isRoutineAssetAggregator: true,
      budgetCategoryId: activeCategories[0]?.id || 'cat-routine',
      type: ProjectType.GeneralAndRoutine,
      budgetPlan: 0,
      categoryBudgetPlan,
      assets: [],
      assetCode: '',
      axCode: '',
      assetName: '',
      completionRate: 100,
      taskToDo: 'N/A',
      owner: 'System',
      targetStart: `${year}-01-01`,
      endDate: `${year}-12-31`,
      status: ProjectStatus.OnTrack,
      plan: 'A',
      budgetCarryForward: 0,
      budgetAllocated: 0,
      approvedBudget: 0,
      consumedBudget: 0,
      revenueProjection: 0,
      priorityId: resolveDefaultRegularPriorityId(allPriorities) || 'prio-must-have',
    };

    const newEditedData = cloneDeep(editedData);
    const huToUpdate = newEditedData.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
    if (huToUpdate) {
      huToUpdate.projects.unshift(newProject);
      setEditedData(newEditedData);
      updateIsDirty(true);
    }
  }, [
    isInitialLoad,
    bootstrapReady,
    routineAssetProject,
    selectedHU,
    huId,
    periodName,
    activeCategories,
    allPriorities,
    updateIsDirty,
  ]);

  const handleDataChange = useCallback(
    (newData: Project[]) => {
      if (!editedData || !selectedHU) return;
      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      if (hu) {
        const currentRoutineProject = hu.projects.find((p: Project) => p.isRoutineAssetAggregator);
        const currentPipelineProjects = hu.projects.filter((p: Project) => p.isPipelineProject);
        const updatedProjectIds = new Set(newData.map((p) => p.id));
        const otherProjects = hu.projects.filter(
          (p: Project) =>
            !p.isRoutineAssetAggregator && !p.isPipelineProject && !updatedProjectIds.has(p.id),
        );
        hu.projects = dedupeProjectsById([
          ...(currentRoutineProject ? [currentRoutineProject] : []),
          ...currentPipelineProjects,
          ...newData,
          ...otherProjects,
        ]);
      }
      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
    },
    [editedData, selectedHU, findHu, updateIsDirty],
  );

  const handlePaginatedTableDataChange = useCallback(
    (pageData: Project[]) => {
      const pageStart = (currentPage - 1) * itemsPerPage;
      const mergedRegular = regularProjects.map((project, index) => {
        const pageIndex = index - pageStart;
        if (pageIndex >= 0 && pageIndex < pageData.length) {
          return pageData[pageIndex];
        }
        return project;
      });
      handleDataChange(mergedRegular);
    },
    [regularProjects, currentPage, itemsPerPage, handleDataChange],
  );

  const handlePlannerDataUpdate = useCallback(
    (updatedPeriod: BudgetPeriod) => {
      setEditedData(recalculateBudgets(updatedPeriod));
      updateIsDirty(true);
    },
    [updateIsDirty],
  );

  const handleSave = useCallback(async () => {
    if (!editedData || isSaving || !huId) return;
    setIsSaving(true);

    const recalculated = recalculateBudgets(editedData);
    const serverSnapshot = serverPeriodRef.current;
    try {
      const originalHU =
        serverSnapshot?.archetypes.flatMap((a) => a.units).find((u) => u.id === huId) ?? null;
      const editedHU = recalculated.archetypes.flatMap((a) => a.units).find((u) => u.id === huId) ?? null;

      const { changedProjectIds, deletedProjectIds, touchedAssetIds } = collectBudgetHuSaveChanges(
        originalHU,
        editedHU,
      );

      if (changedProjectIds.size === 0) {
        updateIsDirty(false);
        showToast('Tidak ada perubahan untuk disimpan.');
        return;
      }

      if (originalHU && editedHU) {
        const originalProjectMap = new Map(originalHU.projects.map((p) => [p.id, p] as const));
        const editedProjectMap = new Map(editedHU.projects.map((p) => [p.id, p] as const));
        const auditPromises: Promise<void>[] = [];
        for (const projectId of changedProjectIds) {
          const originalProject = originalProjectMap.get(projectId);
          const editedProject = editedProjectMap.get(projectId);
          if (originalProject && editedProject) {
            auditPromises.push(auditService.logProjectChanges(originalProject, editedProject, currentUser));
          } else if (originalProject && !editedProject) {
            auditPromises.push(auditService.logProjectChanges(originalProject, null, currentUser));
          }
        }
        if (auditPromises.length > 0) {
          await Promise.all(auditPromises);
        }
      }

      const partialPeriod = buildBudgetHuPartialSavePeriod(
        recalculated,
        huId,
        archetypeId,
        changedProjectIds,
        deletedProjectIds,
      );
      const changedProjectIdList = Array.from(changedProjectIds);
      const deletedProjectIdList = Array.from(deletedProjectIds);
      const touchedAssetIdList = Array.from(touchedAssetIds);
      const projectsOnly = touchedAssetIdList.length === 0;

      const saveOptions = {
        huId,
        changedProjectIds: changedProjectIdList,
        deletedProjectIds: deletedProjectIdList,
        touchedAssetIds: touchedAssetIdList,
        partial: true,
        projectsOnly,
      };

      const backendSaved = await saveBudgetHuViaBackend(
        currentUser.id,
        periodName,
        partialPeriod,
        saveOptions,
      );
      if (!backendSaved) {
        if (useBackendSession()) {
          throw new Error(
            'Gagal menyimpan via backend (capexbe). Pastikan backend berjalan dan endpoint /budget-hu/save tersedia.',
          );
        }
        await updateBudgetPeriod(recalculated, currentUser, {
          compareAgainst: serverSnapshot ?? undefined,
          huId,
          changedProjectIds: changedProjectIdList,
          deletedProjectIds: deletedProjectIdList,
          recalculateTaskStatusesForAssetIds: touchedAssetIdList,
          projectsOnly,
        });
      }

      let next = recalculateBudgets(cloneDeep(recalculated));
      const remap = applySavedCodeRemaps(next, backendSaved, huId);
      next = remap.period;
      serverPeriodRef.current = cloneDeep(next);
      setEditedData(cloneDeep(next));
      updateIsDirty(false);
      const savedCount = changedProjectIdList.length;
      const deletedCount = deletedProjectIdList.length;
      if (backendSaved) {
        showToast(
          deletedCount > 0
            ? `Perubahan tersimpan (${deletedCount} project dihapus${savedCount > deletedCount ? `, ${savedCount - deletedCount} diperbarui` : ''}).`
            : remap.remappedCodes.length > 0
              ? `Perubahan tersimpan. Kode disesuaikan agar unik: ${remap.remappedCodes.slice(0, 3).join(', ')}${remap.remappedCodes.length > 3 ? '…' : ''}`
              : `Perubahan tersimpan (${savedCount} project${savedCount === 1 ? '' : 's'}).`,
          'success',
        );
      } else {
        showToast(
          deletedCount > 0
            ? `Perubahan tersimpan ke Supabase (${deletedCount} project dihapus${savedCount > deletedCount ? `, ${savedCount - deletedCount} diperbarui` : ''}).`
            : `Perubahan tersimpan ke Supabase (${savedCount} project${savedCount === 1 ? '' : 's'}).`,
          'success',
        );
      }
      onBudgetPeriodSaved?.(next);
      onDataChange();
      invalidateRequestCache('app:table:budget-hu:');
      invalidateBudgetHuDiskCache(periodName, currentUser.id);
      writeBudgetPeriodCache(periodName, currentUser.id, next, { replace: true });
      void invalidateBudgetHuBackendCache(periodName, currentUser.id);
      queryClient.setQueryData(queryKeys.budgetHu.page(periodName, currentUser.id, huId), (old: typeof remoteBundle) =>
        old
          ? {
              ...old,
              budgetPeriod: next,
            }
          : old,
      );
      queryClient.setQueryData(queryKeys.budgetSiloamPeriod.detail(periodName), (old: unknown) =>
        old && typeof old === 'object' && old !== null && 'budgetPeriod' in old
          ? { ...(old as object), budgetPeriod: next }
          : old,
      );
      if (deletedProjectIdList.length > 0) {
        queryClient.setQueryData(
          queryKeys.budgetHu.assetCounts(periodName, currentUser.id),
          (old: Record<string, number> | undefined) => {
            if (!old) return old;
            const nextCounts = { ...old };
            for (const projectId of deletedProjectIdList) {
              delete nextCounts[projectId];
            }
            return nextCounts;
          },
        );
      }
    } catch (err) {
      setError('Failed to save changes.');
      showToast('Failed to save changes.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [
    editedData,
    currentUser,
    showToast,
    onDataChange,
    onBudgetPeriodSaved,
    updateIsDirty,
    huId,
    isSaving,
    archetypeId,
    queryClient,
    periodName,
    remoteBundle,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData(serverPeriodRef.current ? cloneDeep(serverPeriodRef.current) : null);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    const budgetPeriod = serverPeriodRef.current;
    if (!isDirty || !budgetPeriod || !editedData || !huId) return null;
    const originalHU = budgetPeriod.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
    const editedHU = editedData.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);

    if (!originalHU || !editedHU) return null;

    const changes: { item: string; before: string; after: string }[] = [];

    const originalProjects = originalHU.projects.filter((p) => !p.isRoutineAssetAggregator);
    const editedProjects = editedHU.projects.filter((p) => !p.isRoutineAssetAggregator);

    if (originalProjects.length !== editedProjects.length) {
      changes.push({
        item: 'Project Count',
        before: originalProjects.length.toString(),
        after: editedProjects.length.toString(),
      });
    }

    editedProjects.forEach((editedProject) => {
      const originalProject = originalProjects.find((p) => p.id === editedProject.id);
      if (!originalProject) return;

      const fieldsToCompare: (keyof Project)[] = ['budgetPlan', 'budgetCarryForward', 'approvedBudget'];
      fieldsToCompare.forEach((field) => {
        const originalValue = (originalProject[field] as number) || 0;
        const editedValue = (editedProject[field] as number) || 0;
        if (originalValue !== editedValue) {
          changes.push({
            item: `Prj '${editedProject.projectName.substring(0, 15)}...' - ${String(field).replace('budget', '')}`,
            before: formatCurrency(originalValue),
            after: formatCurrency(editedValue),
          });
        }
      });

      if (editedProject.isPipelineProject) {
        const originalPipelineQty = (originalProject.pipelineData ?? []).reduce(
          (sum, row) => sum + (Number(row.qty) || 0),
          0,
        );
        const editedPipelineQty = (editedProject.pipelineData ?? []).reduce(
          (sum, row) => sum + (Number(row.qty) || 0),
          0,
        );
        if (originalPipelineQty !== editedPipelineQty) {
          changes.push({
            item: `Pipeline '${editedProject.projectName.substring(0, 15)}...' - Items`,
            before: originalPipelineQty.toString(),
            after: editedPipelineQty.toString(),
          });
        }
      }
    });

    const originalRoutineProject = originalHU.projects.find((p) => p.isRoutineAssetAggregator);
    const editedRoutineProject = editedHU.projects.find((p) => p.isRoutineAssetAggregator);

    if (originalRoutineProject && editedRoutineProject) {
      const originalRoutineAssets = originalRoutineProject.assets.length || 0;
      const editedRoutineAssets = editedRoutineProject.assets.length || 0;
      if (originalRoutineAssets !== editedRoutineAssets) {
        changes.push({
          item: 'Routine Asset Count',
          before: originalRoutineAssets.toString(),
          after: editedRoutineAssets.toString(),
        });
      }

      allCategories.forEach((cat) => {
        if (!cat.isActive) return;
        const originalPlan = originalRoutineProject.categoryBudgetPlan?.[cat.id] || 0;
        const editedPlan = editedRoutineProject.categoryBudgetPlan?.[cat.id] || 0;
        if (originalPlan !== editedPlan) {
          changes.push({
            item: `Routine - ${cat.name} Plan`,
            before: formatCurrency(originalPlan),
            after: formatCurrency(editedPlan),
          });
        }
      });
    }

    if (changes.length > 0) {
      return { title: `Changes in ${editedHU.name}`, changes };
    }
    return null;
  }, [isDirty, editedData, huId, allCategories]);

  useEffect(() => {
    setPageActions({
      onSave: handleSave,
      onCancel: handleCancel,
      getSummary: getChangeSummary,
    });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const handleAddNewProject = useCallback(() => {
    if (!selectedHU || !editedData) return;
    setIsCreatingNewProject(true);
    setIsSelectingCategory(true);
  }, [selectedHU, editedData]);

  const handleCategorySelectedForNewProject = useCallback(
    async (categoryId: string) => {
      setIsSelectingCategory(false);
      if (!selectedHU || !editedData) return;

      const huCode = selectedHU.code;

      // Server reserves a unique nn atomically — do not use local max+1 (races across browsers).
      let allocated: string | null = null;
      try {
        allocated = await allocateProjectCodeViaBackend({
          userId: currentUser.id,
          periodName: editedData.periodName,
          huCode,
        });
      } catch (err) {
        console.error('allocateProjectCodeViaBackend failed:', err);
      }
      if (!allocated) {
        showToast(
          'Gagal mengalokasikan project code dari server. Coba lagi — hindari bentrok kode antar user.',
          'error',
        );
        setIsCreatingNewProject(false);
        return;
      }

      const periodRef = cloneDeep(editedData);
      const huContainer = findHu(periodRef);
      const projectType =
        huContainer?.archetype?.id === PIPELINE_ARCHETYPE_ID
          ? ProjectType.ProjectPipeline
          : ProjectType.Strategic;

      const newProject: Project = {
        id: `PROJ-${huCode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        assetCode: '',
        axCode: '',
        projectName: 'New Project',
        assetName: '',
        completionRate: 0,
        taskToDo: '',
        owner: '',
        targetStart: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        status: ProjectStatus.OnTrack,
        plan: 'A',
        projectCode: allocated,
        budgetPlan: 0,
        budgetCarryForward: 0,
        budgetAllocated: 0,
        approvedBudget: 0,
        consumedBudget: 0,
        revenueProjection: 0,
        priorityId: resolveDefaultRegularPriorityId(allPriorities) || '',
        type: projectType,
        budgetCategoryId: categoryId,
        assets: [],
      };

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      if (hu) {
        hu.projects.push(newProject);
      }
      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
      setSelectedProjectForAssets(newProject);
    },
    [selectedHU, editedData, allPriorities, findHu, updateIsDirty, currentUser.id, showToast],
  );

  const handleCloseProjectAssetsModal = useCallback(() => {
    setSelectedProjectForAssets(null);
    setIsCreatingNewProject(false);
  }, []);

  const handleMassUpdateProjects = useCallback(
    async (changes: {
      toCreate: Omit<Project, 'id' | 'projectCode' | 'assets'>[];
      toUpdate: Project[];
      toDeleteIds: string[];
    }) => {
      if (!editedData || !selectedHU) return;

      const newEditedData = cloneDeep(editedData);
      const huContainer = findHu(newEditedData);
      const arch = huContainer?.archetype;
      const hu = huContainer?.hu;
      if (!hu) return;

      hu.projects = hu.projects.filter((p: Project) => !changes.toDeleteIds.includes(p.id));

      changes.toUpdate.forEach((updatedProject) => {
        const index = hu.projects.findIndex((p: Project) => p.id === updatedProject.id);
        if (index !== -1) {
          const originalProject = hu.projects[index];
          auditService.logProjectChanges(originalProject, updatedProject, currentUser);
          hu.projects[index] = updatedProject;
        }
      });

      const huCode = hu.code;
      let massSeq = 0;

      const projectType =
        arch?.id === PIPELINE_ARCHETYPE_ID ? ProjectType.ProjectPipeline : ProjectType.Strategic;

      const newProjects: Project[] = [];
      for (const data of changes.toCreate) {
        let allocated: string | null = null;
        try {
          allocated = await allocateProjectCodeViaBackend({
            userId: currentUser.id,
            periodName: newEditedData.periodName,
            huCode,
          });
        } catch (err) {
          console.error('allocateProjectCodeViaBackend (mass) failed:', err);
        }
        if (!allocated) {
          showToast('Gagal mengalokasikan project code dari server untuk mass create.', 'error');
          return;
        }

        massSeq++;
        newProjects.push({
          ...data,
          id: `PROJ-${huCode}-${Date.now()}-${massSeq}-${Math.random().toString(36).slice(2, 6)}`,
          projectCode: allocated,
          assets: [],
          budgetAllocated: 0,
          consumedBudget: 0,
          type: projectType,
          priorityId: resolveDefaultRegularPriorityId(allPriorities) || '',
          assetCode: '',
          axCode: data.axCode || '',
          assetName: '',
          completionRate: 0,
          taskToDo: '',
          owner: '',
          targetStart: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          status: ProjectStatus.OnTrack,
          plan: 'A',
          revenueProjection: 0,
        });
      }

      hu.projects.push(...newProjects);

      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
      showToast(
        `${changes.toCreate.length} added, ${changes.toUpdate.length} updated, ${changes.toDeleteIds.length} deleted.`,
        'success',
      );
    },
    [editedData, selectedHU, findHu, currentUser, allPriorities, updateIsDirty, showToast],
  );

  const handleRoutineAssetsChange = useCallback(
    (updatedAssets: Asset[]) => {
      if (!editedData || !selectedHU || !routineAssetProject) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      const proj = hu?.projects.find((p: Project) => p.id === routineAssetProject.id);

      if (proj) {
        proj.assets = sortAssetsByCode(updatedAssets);
      }

      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
    },
    [editedData, selectedHU, routineAssetProject, findHu, updateIsDirty],
  );

  const handleRoutineProjectChange = useCallback(
    (updatedProject: Project) => {
      if (!editedData || !selectedHU) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      if (hu) {
        const projectIndex = hu.projects.findIndex((p: Project) => p.id === updatedProject.id);
        if (projectIndex !== -1) {
          auditService.logProjectChanges(hu.projects[projectIndex], updatedProject, currentUser);
          hu.projects[projectIndex] = updatedProject;
        }
      }

      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
    },
    [editedData, selectedHU, findHu, currentUser, updateIsDirty],
  );

  const handleSaveProject = useCallback(
    async (updatedProject: Project) => {
      if (!editedData || !selectedHU) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;

      if (hu) {
        const projectIndex = hu.projects.findIndex((p: Project) => p.id === updatedProject.id);
        if (projectIndex !== -1) {
          await auditService.logProjectChanges(hu.projects[projectIndex], updatedProject, currentUser);
          hu.projects[projectIndex] = updatedProject;
        } else {
          hu.projects.push(updatedProject);
        }
      }
      const recalculated = recalculateBudgets(newEditedData);
      setEditedData(recalculated);

      if (selectedProjectForAssets?.id === updatedProject.id) {
        const reselected = hu?.projects.find((p: Project) => p.id === updatedProject.id);
        setSelectedProjectForAssets(reselected || null);
      }
      updateIsDirty(true);
    },
    [editedData, selectedHU, findHu, currentUser, selectedProjectForAssets, updateIsDirty],
  );

  const handleSaveAsset = useCallback(
    async (updatedAsset: Asset) => {
      if (!editedData || !selectedHU || !selectedProjectForAssets) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      const project = hu?.projects.find((p: Project) => p.id === selectedProjectForAssets.id);
      if (project) {
        const assetIndex = project.assets.findIndex((a: Asset) => a.id === updatedAsset.id);
        if (assetIndex !== -1) {
          project.assets[assetIndex] = updatedAsset;
        } else {
          let allocated: string | null = null;
          try {
            allocated = await allocateAssetCodeViaBackend({
              userId: currentUser.id,
              projectCode: project.projectCode,
            });
          } catch (err) {
            console.error('allocateAssetCodeViaBackend failed:', err);
          }
          if (!allocated) {
            showToast('Gagal mengalokasikan asset code dari server. Coba lagi.', 'error');
            return;
          }
          const toAdd: Asset = {
            ...updatedAsset,
            id: updatedAsset.id?.trim() ? updatedAsset.id : newAssetId(project.projectCode),
            assetCode: allocated,
          };
          project.assets.push(toAdd);
        }
        project.assets = sortAssetsByCode(project.assets);
      }
      const recalculated = recalculateBudgets(newEditedData);
      setEditedData(recalculated);
      const reselectedProject = getSelectedHU(recalculated, huId, archetypeId)?.projects.find(
        (p) => p.id === selectedProjectForAssets.id,
      );
      setSelectedProjectForAssets(reselectedProject || null);
      updateIsDirty(true);
    },
    [
      editedData,
      selectedHU,
      selectedProjectForAssets,
      findHu,
      huId,
      archetypeId,
      updateIsDirty,
      currentUser.id,
      showToast,
    ],
  );

  const handleUseExistingProject = useCallback(
    (existing: Project) => {
      if (!editedData || !huId) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      if (!hu) return;

      if (isCreatingNewProject && selectedProjectForAssets) {
        hu.projects = hu.projects.filter((p: Project) => p.id !== selectedProjectForAssets.id);
      }

      const alreadyInHu = hu.projects.some((p: Project) => p.id === existing.id);
      if (!alreadyInHu) {
        hu.projects.push(existing);
      }

      const recalculated = recalculateBudgets(newEditedData);
      setEditedData(recalculated);
      setSelectedProjectForAssets(existing);
      setIsCreatingNewProject(false);
      updateIsDirty(true);
      showToast(`Using existing project ${existing.projectCode}`, 'success');
    },
    [
      editedData,
      huId,
      findHu,
      isCreatingNewProject,
      selectedProjectForAssets,
      updateIsDirty,
      showToast,
    ],
  );

  const handleUseExistingAsset = useCallback(
    (existing: Asset) => {
      if (!editedData || !selectedHU || !selectedProjectForAssets) return;

      const newEditedData = cloneDeep(editedData);
      const hu = findHu(newEditedData)?.hu;
      const project = hu?.projects.find((p: Project) => p.id === selectedProjectForAssets.id);
      if (!project) return;

      if (project.assets.some((a: Asset) => a.id === existing.id)) {
        showToast(`Asset ${existing.assetCode} is already in this project.`, 'error');
        return;
      }

      project.assets.push(existing);
      const recalculated = recalculateBudgets(newEditedData);
      setEditedData(recalculated);
      const reselectedProject = getSelectedHU(recalculated, huId, archetypeId)?.projects.find(
        (p) => p.id === selectedProjectForAssets.id,
      );
      setSelectedProjectForAssets(reselectedProject || null);
      updateIsDirty(true);
      showToast(`Using existing asset ${existing.assetCode}`, 'success');
    },
    [editedData, selectedHU, selectedProjectForAssets, findHu, huId, archetypeId, updateIsDirty, showToast],
  );

  const handleUseExistingRoutineAsset = useCallback(
    (existing: Asset) => {
      if (!editedData || !routineAssetProject) return;
      if (routineAssetProject.assets.some((a) => a.id === existing.id)) {
        showToast(`Asset ${existing.assetCode} is already in this routine project.`, 'error');
        return;
      }
      handleRoutineAssetsChange([...routineAssetProject.assets, existing]);
    },
    [editedData, routineAssetProject, handleRoutineAssetsChange, showToast],
  );

  const handleShowPerformance = useCallback(() => {
    if (!selectedHU) return;
    setIsPerformanceModalOpen(true);
  }, [selectedHU]);

  const handleSaveFSProposal = useCallback(
    async (fsData: Omit<FeasibilityStudy, 'createdAt' | 'updatedAt'>) => {
      if (!selectedProjectForFS) return;
      if (!canCreateFS) {
        showToast('Anda tidak memiliki izin untuk membuat atau menginput FS.', 'error');
        return;
      }
      try {
        await fsService.createFSProposal(fsData, { userId: currentUser.id });
        for (const asset of selectedProjectForFS.assets) {
          await taskService.triggerSystemTask(asset.id, 'FS_REQUEST', currentUser);
        }
        showToast('FS Proposal created successfully!', 'success');
        setSelectedProjectForFS(null);
        void fsQuery.refetch();
      } catch (saveErr) {
        console.error('Failed to save FS proposal:', saveErr);
        showToast('Failed to create FS Proposal.', 'error');
      }
    },
    [selectedProjectForFS, canCreateFS, currentUser, showToast, fsQuery],
  );

  const handleConfirmDeleteProject = useCallback(() => {
    if (!projectToDelete || !editedData || !selectedHU) return;

    const linkedAssetCount =
      assetCountByProjectId.get(projectToDelete.id) ?? projectToDelete.assets?.length ?? 0;
    if (linkedAssetCount > 0) {
      showToast(
        'Project tidak dapat dihapus karena masih memiliki asset. Hapus semua asset terlebih dahulu.',
        'error',
      );
      setProjectToDelete(null);
      return;
    }

    if (projectToDelete.isRoutineAssetAggregator || projectToDelete.isPipelineProject) {
      showToast('Project sistem (Routine/Pipeline) tidak dapat dihapus.', 'error');
      setProjectToDelete(null);
      return;
    }

    const newEditedData = cloneDeep(editedData);
    const hu = findHu(newEditedData)?.hu;

    if (hu) {
      hu.projects = hu.projects.filter((p: Project) => p.id !== projectToDelete.id);
      void auditService.logProjectChanges(projectToDelete, null, currentUser);
      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
      showToast('Project dihapus dari daftar. Klik Save Changes untuk menyimpan.', 'success');
    }

    if (selectedProjectForAssets?.id === projectToDelete.id) {
      setSelectedProjectForAssets(null);
      setIsCreatingNewProject(false);
    }
    if (selectedProjectForFS?.id === projectToDelete.id) {
      setSelectedProjectForFS(null);
    }

    setProjectToDelete(null);
  }, [
    projectToDelete,
    editedData,
    selectedHU,
    findHu,
    currentUser,
    updateIsDirty,
    showToast,
    assetCountByProjectId,
    selectedProjectForAssets,
    selectedProjectForFS,
  ]);

  const authoritativeHu = useMemo(
    () => getSelectedHU(currentBudgetPeriod ?? null, huId, archetypeId),
    [currentBudgetPeriod, huId, archetypeId],
  );

  const summaryTableData: BudgetSummaryRow[] = useMemo(() => {
    if (!selectedHU) return [];
    return buildBudgetHuSummaryRows(selectedHU, activeCategories, authoritativeHu);
  }, [selectedHU, activeCategories, authoritativeHu]);

  const isProjectEditable = permissions.isAllowed('Project', 'edit');
  const isAssetEditable = permissions.isAllowed('Asset', 'edit');
  const canCreateProject = permissions.isAllowed('Project', 'create');
  const canEditProjectPriority = useMemo(
    () => userCanEditProjectPriority(currentUser),
    [currentUser],
  );

  const tourReady =
    !isInitialLoad && !!selectedHU && !!displayPeriod && !isPlannerOpen && !isPerformanceModalOpen;

  const { isTourOpen, steps: tourSteps, startTour, handleTourClose } = useBudgetHuTour({
    userId: currentUser.id,
    ready: tourReady,
    canSave: isProjectEditable || isAssetEditable,
    canCreateProject,
    showRoutineAsset: !!routineAssetProject,
  });

  const onCreateFs = useCallback(
    (project: Project) => {
      if (!canCreateFS) {
        showToast('Anda tidak memiliki izin untuk membuat atau menginput FS.', 'error');
        return;
      }
      setSelectedProjectForFS(project);
    },
    [canCreateFS, showToast],
  );
  const onViewFs = useCallback(
    async (project: Project, fs: FeasibilityStudy) => {
      try {
        const full = await fsService.getFeasibilityStudyById(fs.id, { userId: currentUser.id });
        setViewFS({ project, fs: full ?? fs });
      } catch {
        setViewFS({ project, fs });
      }
    },
    [currentUser.id],
  );
  const onOpenProjectAssets = useCallback((project: Project) => setSelectedProjectForAssets(project), []);
  const onDeleteProject = useCallback((project: Project) => setProjectToDelete(project), []);

  const {
    visibleIds: visibleColumnIds,
    toggleColumn: toggleTableColumn,
    resetToDefault: resetTableColumns,
    showAllToggleable: showAllTableColumns,
  } = useBudgetHuColumnVisibility();

  const categorySelectOptions = useMemo(
    () => activeCategories.map((c) => ({ value: c.id, label: c.name })),
    [activeCategories],
  );

  const prioritySelectOptions = useMemo(
    () =>
      allPriorities
        .filter((p) => p.isActive)
        .map((p) => ({ value: p.id, label: p.name })),
    [allPriorities],
  );

  const priorityDisplayOptions = useMemo(
    () => allPriorities.map((p) => ({ value: p.id, label: p.name })),
    [allPriorities],
  );

  const allProjectColumns: SpreadsheetColumn<Project>[] = useMemo(
    () =>
      buildBudgetHuProjectColumns({
        isProjectEditable,
        categorySelectOptions,
        prioritySelectOptions,
        priorityDisplayOptions,
        fsDataMap,
        onCreateFs,
        onViewFs,
        onOpenProjectAssets,
        onDeleteProject,
        canEditPriority: canEditProjectPriority,
        canCreateFs: canCreateFS,
        assetCountByProjectId,
      }),
    [
      isProjectEditable,
      categorySelectOptions,
      prioritySelectOptions,
      priorityDisplayOptions,
      fsDataMap,
      onCreateFs,
      onViewFs,
      onOpenProjectAssets,
      onDeleteProject,
      canEditProjectPriority,
      assetCountByProjectId,
      canCreateFS,
    ],
  );

  const projectColumns = useMemo(
    () =>
      allProjectColumns.filter((col) =>
        visibleColumnIds.has((col.id ?? col.header) as BudgetHuTableColumnId),
      ),
    [allProjectColumns, visibleColumnIds],
  );

  const handleSearchChange = useCallback((value: string) => setSearchTerm(value), []);
  const handleClearSearch = useCallback(() => setSearchTerm(''), []);
  const handlePageChange = useCallback((page: number) => setCurrentPage(page), []);
  const handleItemsPerPageChange = useCallback((size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = useCallback(async () => {
    if (!selectedHU || !periodName.trim() || isExporting) return;
    setIsExporting(true);
    try {
      const exportRows = await fetchBudgetHuProjectsForExport(periodName, {
        id: selectedHU.id,
        name: selectedHU.name,
      });
      if (exportRows.length === 0) {
        showToast('Tidak ada project untuk diexport.', 'error');
        return;
      }

      const XLSX = await import('xlsx');
      let fsByProjectId: Map<string, FeasibilityStudy> = fsDataMap;
      if (fsByProjectId.size === 0) {
        const studies = await fsService.getAllFeasibilityStudies({ userId: currentUser.id }).catch(() => []);
        fsByProjectId = new Map(studies.map((s) => [s.projectId, s]));
      }
      const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name] as const));
      const priorityNameById = new Map(allPriorities.map((p) => [p.id, p.name] as const));
      const periodLabelForExport = displayPeriod?.periodName || periodName || '';

      const rows = exportRows.map(({ huName, project, assetCount }, index) => {
        const budgetPlan = project.budgetPlan || 0;
        const budgetCarryForward = project.budgetCarryForward || 0;
        const budgetAllocated = project.budgetAllocated || 0;
        const approvedBudget = project.approvedBudget || 0;
        const consumedBudget = project.consumedBudget || 0;
        const fs = fsByProjectId.get(project.id);

        return {
          No: index + 1,
          'Hospital Unit': huName,
          'Budget Period': periodLabelForExport,
          'Project Code': project.projectCode || '',
          'Project Name': project.projectName || '',
          'AX Code': project.axCode || '',
          'Budget Category':
            categoryNameById.get(project.budgetCategoryId) || project.budgetCategoryId || '',
          Priority: priorityNameById.get(project.priorityId) || '',
          'Budget Plan': budgetPlan,
          'Budget Carry Forward': budgetCarryForward,
          'Budget Allocated to Asset': budgetAllocated,
          'Remaining to Allocate': budgetPlan + budgetCarryForward - budgetAllocated,
          'FS Budget': approvedBudget,
          'Remaining To Approved': budgetPlan + budgetCarryForward - approvedBudget,
          'Realization Budget': consumedBudget,
          'Remaining to Consume': budgetPlan + budgetCarryForward - consumedBudget,
          'FS Status': fs?.conclusion || 'Not Submitted',
          'Asset Count': assetCount,
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Projects');

      const safeHu = (selectedHU.code || selectedHU.name).replace(/[^a-z0-9-_]/gi, '_');
      const safePeriod = periodLabelForExport.replace(/[^a-z0-9-_]/gi, '_') || 'period';
      const dateTag = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `budget_hu_projects_${safeHu}_${safePeriod}_${dateTag}.xlsx`);
      showToast(`Export ${rows.length} project berhasil.`, 'success');
    } catch (err) {
      console.warn('Budget HU export failed:', err);
      showToast(err instanceof Error ? err.message : 'Gagal export Excel.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedHU,
    isExporting,
    allCategories,
    allPriorities,
    fsDataMap,
    currentUser.id,
    displayPeriod?.periodName,
    periodName,
    showToast,
  ]);

  if (error) {
    return <div className="text-center p-8 text-danger">{error}</div>;
  }
  if (!canView) {
    return <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>;
  }

  const periodLabel = displayPeriod?.periodName || periodName || '';
  const hasPeriodData = !!displayPeriod;

  return (
    <div className="space-y-6">
      <div
        data-tour="budget-hu-header"
        className="flex justify-between items-center gap-4 border-b border-siloam-border pb-4 mb-6"
      >
        <div>
          <h2 className="text-2xl font-bold text-siloam-text-primary">
            {selectedHU?.name || 'Overview'} Overview
          </h2>
          <p className="text-sm text-siloam-text-secondary">
            {periodLabel}
            {isInitialLoad ? (
              <span className="ml-2 text-xs text-siloam-blue animate-pulse">· Memuat data…</span>
            ) : isBackgroundRefresh ? (
              <span className="ml-2 text-xs text-siloam-text-secondary/80">· Memperbarui…</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startTour}
            className="px-3 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-secondary hover:text-siloam-text-primary text-sm font-medium flex items-center gap-1.5 transition"
            aria-label="Buka panduan halaman Budget HU"
          >
            <HelpCircle className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Panduan</span>
          </button>
          <button
            type="button"
            data-tour="budget-hu-unit-performance"
            onClick={handleShowPerformance}
            disabled={!selectedHU}
            className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-siloam-blue/90 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            <InsightsIcon /> Unit Performance & Insights
          </button>
          {(isProjectEditable || isAssetEditable) && (
            <div data-tour="budget-hu-save-actions" className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!isDirty || isSaving}
                className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isInitialLoad ? (
        <BudgetHUPageSkeleton />
      ) : !hasPeriodData ? (
        <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft">
          No data found for this period.
        </div>
      ) : !selectedHU ? (
        <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft">
          Please select an Archetype and Hospital Unit to view details, or you may not have access to any.
        </div>
      ) : (
        <div className="relative space-y-6">
          {isBackgroundRefresh ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-siloam-border"
              aria-hidden
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-siloam-blue/70" />
            </div>
          ) : null}
          <div data-tour="budget-hu-summary">
            <BudgetSummary
              data={summaryTableData}
              isCompact={isSummaryCompact}
              onToggleCompact={() => setIsSummaryCompact((v) => !v)}
            />
          </div>

          {isPipelineHU ? (
            <div className="space-y-2" data-tour="budget-hu-pipeline">
              <PipelineSummaryCard
                projects={pipelineProjects}
                isExpanded={isPipelineSectionExpanded}
                onToggleExpand={() => setIsPipelineSectionExpanded((v) => !v)}
                onOpenFullPlanner={() => setIsPlannerOpen(true)}
              />
              {isPipelineSectionExpanded && editedData && huId ? (
                <div className="rounded-xl border border-siloam-border bg-siloam-surface shadow-soft overflow-hidden">
                  <div className="max-h-[min(42vh,420px)] overflow-y-auto overscroll-contain">
                    <Suspense
                      fallback={
                        <div className="p-6 text-siloam-text-secondary text-sm">Loading pipeline planner…</div>
                      }
                    >
                      <ProjectPipelinePage
                        budgetPeriod={editedData}
                        huId={huId}
                        onDataUpdate={handlePlannerDataUpdate}
                        showToast={showToast}
                        currentUser={currentUser}
                        allRoles={allRoles}
                      />
                    </Suspense>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {routineAssetProject ? (
            <div data-tour="budget-hu-routine-assets">
              <RoutineAssetCard
                project={routineAssetProject}
                onManageAssets={() => setAssetModalOpen(true)}
                isEditable={isAssetEditable}
                onAssetsChange={handleRoutineAssetsChange}
                onProjectChange={handleRoutineProjectChange}
                maxBudgetPerAsset={routineAssetMaxBudget}
                activeCategories={activeCategories}
                allWorkflows={allWorkflows}
                allAssetTypes={allAssetTypes}
                periodName={periodName}
                userId={currentUser.id}
                huId={huId}
                onUseExistingAsset={handleUseExistingRoutineAsset}
              />
            </div>
          ) : null}

          <BudgetHuStrategicProjectsSection
            huKey={huId ?? 'no-hu'}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            onClearSearch={handleClearSearch}
            paginatedProjects={paginatedProjects}
            filteredCount={filteredProjects.length}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            projectColumns={projectColumns}
            onDataChange={handlePaginatedTableDataChange}
            canCreateProject={canCreateProject}
            onAddProject={handleAddNewProject}
            onBulkManage={() => setIsMassEditOrAddModalOpen(true)}
            onEditProject={onOpenProjectAssets}
            allCategories={allCategories}
            allPriorities={allPriorities}
            visibleColumnIds={visibleColumnIds}
            onToggleColumn={toggleTableColumn}
            onResetColumns={resetTableColumns}
            onShowAllColumns={showAllTableColumns}
            onExportExcel={() => void handleExportExcel()}
            isExporting={isExporting}
          />
        </div>
      )}

      {isAssetModalOpen && routineAssetProject ? (
        <Suspense fallback={null}>
          <AssetEditorModal
            isOpen={isAssetModalOpen}
            onClose={() => setAssetModalOpen(false)}
            project={routineAssetProject}
            onAssetsChange={handleRoutineAssetsChange}
            isEditable={isAssetEditable}
            showToast={showToast}
            allWorkflows={allWorkflows}
            allAssetTypes={allAssetTypes}
            activeCategories={activeCategories}
            periodName={periodName}
            userId={currentUser.id}
            huId={huId}
            onUseExistingAsset={handleUseExistingRoutineAsset}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <ProjectAssetsModal
          isOpen={!!selectedProjectForAssets}
          onClose={handleCloseProjectAssetsModal}
          isCreating={isCreatingNewProject}
          project={selectedProjectForAssets}
          onSaveProject={handleSaveProject}
          onSaveAsset={handleSaveAsset}
          allWorkflows={allWorkflows}
          allAssetTypes={allAssetTypes}
          allCategories={allCategories}
          allPriorities={allPriorities}
          allUsers={allUsers}
          showToast={showToast}
          canEditPriority={canEditProjectPriority}
          periodName={periodName}
          userId={currentUser.id}
          huId={huId}
          onUseExistingProject={handleUseExistingProject}
          onUseExistingAsset={handleUseExistingAsset}
        />
      </Suspense>

      <SelectCategoryModal
        isOpen={isSelectingCategory}
        onClose={() => setIsSelectingCategory(false)}
        onSelect={handleCategorySelectedForNewProject}
        categories={allCategories}
        title="Create New Strategic Project"
      />

      {isMassEditOrAddModalOpen ? (
        <Suspense fallback={null}>
          <MassAddOrEditProjectsModal
            isOpen={isMassEditOrAddModalOpen}
            onClose={() => setIsMassEditOrAddModalOpen(false)}
            onSave={handleMassUpdateProjects}
            existingProjects={regularProjects}
            allCategories={allCategories}
          />
        </Suspense>
      ) : null}

      {isPlannerOpen && editedData && huId ? (
        <div className="fixed inset-0 bg-siloam-surface z-[60] flex flex-col animate-fade-in">
          <header className="flex-shrink-0 bg-siloam-surface border-b border-siloam-border px-4 py-3 md:px-6 flex justify-between items-center">
            <h2 className="text-xl font-bold">Pipeline Planner: {selectedHU?.name}</h2>
            <button
              type="button"
              onClick={() => setIsPlannerOpen(false)}
              className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft"
            >
              Close Planner
            </button>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="p-8 text-siloam-text-secondary text-sm">Loading planner…</div>}>
              <ProjectPipelinePage
                budgetPeriod={editedData}
                huId={huId}
                onDataUpdate={handlePlannerDataUpdate}
                showToast={showToast}
                currentUser={currentUser}
                allRoles={allRoles}
              />
            </Suspense>
          </main>
        </div>
      ) : null}

      {selectedHU ? (
        <Suspense fallback={null}>
          <UnitPerformanceModal
            isOpen={isPerformanceModalOpen}
            onClose={() => setIsPerformanceModalOpen(false)}
            hospitalUnit={selectedHU}
            allUsers={allUsers}
            allRoles={allRoles}
            activeCategories={activeCategories}
            fsDataByProjectId={fsDataMap}
            periodName={periodLabel}
          />
        </Suspense>
      ) : null}

      {selectedProjectForFS && canCreateFS ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={selectedProjectForFS}
            onClose={() => setSelectedProjectForFS(null)}
            onSave={handleSaveFSProposal}
          />
        </Suspense>
      ) : null}

      {viewFS ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={viewFS.project}
            existingFS={viewFS.fs}
            onClose={() => setViewFS(null)}
            onSave={async () => {}}
            readOnly
          />
        </Suspense>
      ) : null}

      <DeleteProjectConfirmModal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDeleteProject}
        project={projectToDelete}
        assetCount={
          projectToDelete
            ? assetCountByProjectId.get(projectToDelete.id) ?? projectToDelete.assets?.length ?? 0
            : 0
        }
      />

      <PageTourOverlay steps={tourSteps} isOpen={isTourOpen} onClose={handleTourClose} />
    </div>
  );
};

export const BudgetHUPage = memo(BudgetHUPageInner);
BudgetHUPage.displayName = 'BudgetHUPage';
