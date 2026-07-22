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
import { useQueryClient } from '@tanstack/react-query';
import {
  EnrichedAsset,
  User,
  BDDPriority,
  Project,
  Asset,
  UserRole,
  Page,
  AssetTaskStatus,
  TaskLog,
  WorkflowStep,
  TaskCurrentStatus,
} from '../types';
import * as taskService from '../services/taskService';
import { invalidateAssetTimelineCache } from '../lib/assetTimelineCache';
import { saveAssetViaBackend } from '../services/capexCrudApi';
import { normAssetKey } from '../lib/assetKeys';
import {
  invalidateBddConstructionTableCache,
  type BddConstructionTableBundle,
} from '../lib/bddConstructionDiskCache';
import { MeetingFilterBar } from '../components/organisms/MeetingFilterBar/MeetingFilterBar';
import { AssetFilterPanel } from '../components/organisms/AssetFilterPanel/AssetFilterPanel';
import { usePermissions } from '../hooks/usePermissions';
import { BDDConstructionPageSkeleton } from './BDDConstruction/BDDConstructionPageSkeleton';
import { buildHuFilterOptions } from './BDDConstruction/listUtils';
import { useBddRoleFlags } from './BDDConstruction/useBddRoleFlags';
import { useBddConstructionFilterState } from './BDDConstruction/hooks/useBddConstructionFilterState';
import { useBddConstructionTablePipeline } from './BDDConstruction/hooks/useBddConstructionTablePipeline';
import { useBddConstructionTableDisplay } from './BDDConstruction/hooks/useBddConstructionTableDisplay';
import { buildBddConstructionColumns } from './BDDConstruction/buildBddConstructionColumns';
import { BddConstructionTableBlock } from './BDDConstruction/BDDConstructionTableBlock';
import { calculateAssetCompletionRates } from './CapexProjectList/listUtils';

const ConstructionKanbanLazy = lazy(() =>
  import('../components/organisms/ConstructionKanban/ConstructionKanban').then((m) => ({
    default: m.ConstructionKanban,
  })),
);
const AssetTaskTimelineLazy = lazy(() =>
  import('../components/organisms/AssetTaskTimeline/AssetTaskTimeline').then((m) => ({
    default: m.AssetTaskTimeline,
  })),
);
const AddMomModalLazy = lazy(() =>
  import('../components/organisms/AddMomModal/AddMomModal').then((m) => ({
    default: m.AddMomModal,
  })),
);
const AddAdhocTaskModalLazy = lazy(() =>
  import('../components/organisms/AddAdhocTaskModal/AddAdhocTaskModal').then((m) => ({
    default: m.AddAdhocTaskModal,
  })),
);
const AssetTimelineModalLazy = lazy(() =>
  import('../components/organisms/AssetTimelineModal/AssetTimelineModal').then((m) => ({
    default: m.AssetTimelineModal,
  })),
);

interface BDDConstructionPageProps {
  currentUser: User;
  allRoles?: UserRole[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  periodName?: string;
  preloadedSnapshot?: BddConstructionTableBundle | null;
}

const ViewListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);
const ViewBoardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 00-2 2" />
  </svg>
);
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

export const BDDConstructionPage: React.FC<BDDConstructionPageProps> = memo(function BDDConstructionPage({
  currentUser,
  allRoles: appAllRoles = [],
  showToast,
  periodName,
  preloadedSnapshot,
}) {
  const queryClient = useQueryClient();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const roleFlags = useBddRoleFlags(currentUser);
  const { isSuperAdmin, hasBDDRole } = roleFlags;

  const rolesForPermissions = appAllRoles.length > 0 ? appAllRoles : (preloadedSnapshot?.allRoles ?? []);
  const permissions = usePermissions(currentUser, rolesForPermissions);
  const canView =
    permissions.canOperateOnPage(Page.BDDConstruction, 'view') || isSuperAdmin || hasBDDRole;
  const canEditAsset =
    permissions.canOperateOnPage(Page.BDDConstruction, 'edit') || isSuperAdmin || hasBDDRole;

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
  const [selectedAsset, setSelectedAsset] = useState<EnrichedAsset | null>(null);
  const [isMomModalOpen, setMomModalOpen] = useState(false);
  const [isAdhocTaskModalOpen, setAdhocTaskModalOpen] = useState(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [timelineRefreshNonce, setTimelineRefreshNonce] = useState(0);

  const filterState = useBddConstructionFilterState();
  const {
    searchTerm,
    setSearchTerm,
    selectedHUs,
    setSelectedHUs,
    selectedPriorities,
    setSelectedPriorities,
    completionRange,
    setCompletionRange,
    meetingFilters,
    setMeetingFilters,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    debouncedSearch,
    debouncedCompletionRange,
    isSearchStaging,
  } = filterState;

  const effectivePeriodName = periodName?.trim() || '';

  const {
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
    filteredAssets,
    assetLastUpdateTaskMap,
    hasListData,
    showBlockingSkeleton,
    isBackgroundRefetch,
    isFilterRefreshing,
  } = useBddConstructionTablePipeline({
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
  });

  const { tableAssets, footerTotalCount, totalPages } = useBddConstructionTableDisplay({
    filteredAssets,
    listTotalAssetCount,
    itemsPerPage,
    currentPage,
    deferTableRows: isFilterRefreshing,
  });

  const selectedProject = useMemo((): Project | null => {
    if (!selectedAsset) return null;
    return allProjects.find((p) => p.id === selectedAsset.projectId) || null;
  }, [selectedAsset, allProjects]);

  useEffect(() => {
    if (selectedAsset && !filteredAssets.some((a) => a.id === selectedAsset.id)) {
      setSelectedAsset(null);
    }
  }, [filteredAssets, selectedAsset]);

  const huFilterOptions = useMemo(() => buildHuFilterOptions(masterData.hus), [masterData.hus]);
  const priorityFilterOptions = useMemo(
    () => priorities.filter((p) => p.isActive).map((p) => p.name),
    [priorities],
  );

  const refreshSingleAssetData = useCallback(
    (asset: EnrichedAsset) => {
      const str = (id: string | number | undefined) => (id == null ? '' : String(id));
      const idForApi = str(asset.id);
      const mapKey = normAssetKey(asset.id);
      const isDoneRow = (s: AssetTaskStatus) =>
        typeof s.status === 'string'
          ? s.status.toLowerCase() === 'done'
          : s.status === TaskCurrentStatus.Done;

      void (async () => {
        try {
          const [statuses, logs] = await Promise.all([
            taskService.getAssetTaskStatusesForAsset(idForApi),
            taskService.getTaskLogsForAsset(idForApi),
          ]);
          const workflow = allWorkflows.find((w) => str(w.id) === str(asset.workflowSetId));
          if (!workflow) return;

          const statusesByAsset = new Map<string, AssetTaskStatus[]>([[mapKey, statuses]]);
          const logsByAsset = new Map<string, TaskLog[]>([[mapKey, logs]]);
          const rates = calculateAssetCompletionRates([asset], allWorkflows, statusesByAsset, logsByAsset);
          const rate = rates.get(mapKey) ?? 0;

          const stepTaskIds = new Set(workflow.steps.map((s) => str(s.taskId)));
          const doneFromStatuses = new Set(
            statuses.filter(isDoneRow).map((s) => str(s.taskId)).filter((tid) => stepTaskIds.has(tid)),
          );
          const doneFromLogs = new Set(
            logs.map((l) => str(l.taskId)).filter((tid) => stepTaskIds.has(tid)),
          );
          const completedTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);

          let latest: { taskName: string; completedAt?: string; atMs: number } | null = null;
          const consider = (taskId: string, completedAt?: string) => {
            const atMs = completedAt ? new Date(completedAt).getTime() : 0;
            if (!latest || atMs >= latest.atMs) {
              latest = {
                taskName: allTasks.find((t) => str(t.id) === str(taskId))?.name || String(taskId),
                completedAt,
                atMs,
              };
            }
          };
          logs.forEach((log) => consider(String(log.taskId), log.completedAt || undefined));
          statuses.filter(isDoneRow).forEach((s) =>
            consider(String(s.taskId), s.completedAt || undefined),
          );

          let lastTaskName = 'Not Started';
          if (completedTaskIds.size > 0) {
            let lastStep: WorkflowStep | null = null;
            let maxOrder = -1;
            for (const taskIdStr of completedTaskIds) {
              const step = workflow.steps.find((s) => str(s.taskId) === taskIdStr);
              if (step && step.order > maxOrder) {
                maxOrder = step.order;
                lastStep = step;
              }
            }
            if (lastStep) {
              const task = allTasks.find((t) => str(t.id) === str(lastStep!.taskId));
              lastTaskName = task ? task.name : 'In Progress (Unknown)';
            }
          }

          const lastTaskLabel = (latest as { taskName: string } | null)?.taskName ?? lastTaskName;

          queryClient.setQueryData<BddConstructionTableBundle | null>(tableQueryKey, (old) => {
            if (!old) return old;
            return {
              ...old,
              enrichedAssets: old.enrichedAssets.map((a) =>
                normAssetKey(a.id) === mapKey ? { ...a, completionRate: rate } : a,
              ),
              assetLastTaskMap: {
                ...old.assetLastTaskMap,
                [mapKey]: lastTaskLabel,
              },
            };
          });
          setSelectedAsset((prev) =>
            prev && normAssetKey(prev.id) === mapKey ? { ...prev, completionRate: rate } : prev,
          );
        } catch (err) {
          console.error('Failed to refresh asset row', err);
        }
      })();
    },
    [allWorkflows, allTasks, queryClient, tableQueryKey],
  );

  const handlePriorityChange = useCallback(
    async (assetId: string, newPriority: BDDPriority) => {
      const asset = allAssets.find((a) => a.id === assetId);
      if (!asset) return;

      const isMovingToUnassigned = !newPriority || newPriority === 'unassigned' || newPriority === '';
      const isMovingFromUnassigned =
        !asset.bddPriority || asset.bddPriority === 'unassigned' || asset.bddPriority === '';

      if ((isMovingToUnassigned || isMovingFromUnassigned) && !isSuperAdmin && !hasBDDRole) {
        showToastRef.current('Only BDD role can move assets to/from UNASSIGNED', 'error');
        return;
      }

      queryClient.setQueryData<BddConstructionTableBundle | null>(tableQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          enrichedAssets: old.enrichedAssets.map((a) =>
            a.id === assetId ? { ...a, bddPriority: newPriority } : a,
          ),
        };
      });
      if (selectedAsset?.id === assetId) {
        setSelectedAsset((prev) => (prev ? { ...prev, bddPriority: newPriority } : prev));
      }

      try {
        const savePeriodName = effectivePeriodName || selectedProject?.periodName?.trim() || '';
        const payload: Asset = { ...asset, bddPriority: newPriority };
        const backendSaved = await saveAssetViaBackend(currentUser.id, savePeriodName, payload);
        const assetToPersist = backendSaved ?? payload;
        if (!backendSaved) {
          throw new Error('Gagal menyimpan asset via backend.');
        }
        invalidateBddConstructionTableCache(effectivePeriodName, currentUser.id);
        void queryClient.invalidateQueries({ queryKey: tableQueryKey });
      } catch (error) {
        console.error('Failed to update priority', error);
        showToastRef.current('Failed to update priority', 'error');
        void tableQuery.refetch();
      }
    },
    [
      allAssets,
      selectedAsset?.id,
      selectedProject?.periodName,
      isSuperAdmin,
      hasBDDRole,
      currentUser.id,
      effectivePeriodName,
      tableQuery,
      queryClient,
      tableQueryKey,
    ],
  );

  const handleTaskUpdate = useCallback(
    (assetId?: string) => {
      if (assetId) invalidateAssetTimelineCache(assetId);
      void queryClient.invalidateQueries({ queryKey: tableQueryKey });
      if (effectivePeriodName) {
        invalidateBddConstructionTableCache(effectivePeriodName, currentUser.id);
      }
      const idNorm = assetId != null ? normAssetKey(assetId) : null;
      const asset =
        assetId != null ? allAssets.find((a) => normAssetKey(a.id) === idNorm) : selectedAsset;
      if (asset) refreshSingleAssetData(asset);
    },
    [
      allAssets,
      selectedAsset,
      refreshSingleAssetData,
      queryClient,
      currentUser.id,
      effectivePeriodName,
      tableQueryKey,
    ],
  );

  const prefetchTimelineForAsset = useCallback(
    (asset: EnrichedAsset) => {
      const wfId = asset.workflowSetId ?? '';
      if (!String(wfId).trim()) return;
      const project = allProjects.find((p) => String(p.id) === String(asset.projectId));
      void taskService.prefetchAssetTimeline(asset.id, String(wfId), project?.id);
    },
    [allProjects],
  );

  const handleAssetClick = useCallback(
    (asset: EnrichedAsset) => {
      prefetchTimelineForAsset(asset);
      setSelectedAsset((prev) => (prev?.id === asset.id ? null : asset));
    },
    [prefetchTimelineForAsset],
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, [setCurrentPage]);

  const handleItemsPerPageChange = useCallback(
    (size: number) => {
      setItemsPerPage(size);
      setCurrentPage(1);
    },
    [setItemsPerPage, setCurrentPage],
  );

  const tableColumns = useMemo(
    () =>
      buildBddConstructionColumns({
        assetLastUpdateTaskMap,
        assetTags,
        isSuperAdmin,
        hasBDDRole,
        onPriorityChange: handlePriorityChange,
      }),
    [assetLastUpdateTaskMap, assetTags, isSuperAdmin, hasBDDRole, handlePriorityChange],
  );

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (showBlockingSkeleton) {
    return <BDDConstructionPageSkeleton />;
  }

  return (
    <div className="md:flex h-full bg-siloam-surface rounded-xl shadow-soft overflow-hidden">
      <div
        className={`
                flex flex-col h-full w-full transition-all duration-300 ease-in-out
                md:border-r md:border-siloam-border
                ${selectedAsset ? 'hidden md:flex md:w-1/2 lg:w-2/3' : 'flex md:w-full'}
            `}
      >
        <div className="bg-siloam-surface px-4 py-3 border-b border-siloam-border flex flex-wrap items-center gap-4 justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-siloam-text-primary">Construction Meeting</h2>
            <p className="text-sm text-siloam-text-secondary">Manage BDD priorities & tracking.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-siloam-bg p-1 rounded-lg border border-siloam-border">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-siloam-blue' : 'text-siloam-text-secondary hover:text-siloam-text-primary'}`}
                title="Kanban Board"
              >
                <ViewBoardIcon />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-siloam-blue' : 'text-siloam-text-secondary hover:text-siloam-text-primary'}`}
                title="List View"
              >
                <ViewListIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0">
          <MeetingFilterBar
            onFilterChange={setMeetingFilters}
            selectedArchetype={meetingFilters.archetype}
            selectedAssetTypeGroup={meetingFilters.assetTypeGroup}
            variant="flat"
            showAssetGroupFilter={false}
          />
          <AssetFilterPanel
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            huOptions={huFilterOptions}
            selectedHUs={selectedHUs}
            setSelectedHUs={setSelectedHUs}
            completionRange={completionRange}
            setCompletionRange={setCompletionRange}
            priorityOptions={priorityFilterOptions}
            selectedPriorities={selectedPriorities}
            setSelectedPriorities={setSelectedPriorities}
          />
        </div>

        <div className="flex-1 overflow-hidden p-4 bg-siloam-bg relative">
          {isFilterRefreshing && hasListData ? (
            <div className="pointer-events-none absolute inset-x-4 top-0 z-20 flex justify-center py-1">
              <p className="text-xs text-siloam-text-secondary">Memfilter…</p>
            </div>
          ) : null}
          {isBackgroundRefetch ? (
            <div
              className="pointer-events-none absolute inset-x-4 top-0 z-20 h-0.5 overflow-hidden bg-siloam-border rounded"
              aria-hidden
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-siloam-blue/70" />
            </div>
          ) : null}

          {viewMode === 'kanban' ? (
            <Suspense
              fallback={
                <div className="h-full min-h-[200px] animate-pulse bg-siloam-border/30 rounded-xl" />
              }
            >
              <ConstructionKanbanLazy
                assets={filteredAssets}
                tags={assetTags}
                onDropOnColumn={handlePriorityChange}
                onAssetClick={handleAssetClick}
                canEditUnassigned={isSuperAdmin || hasBDDRole}
              />
            </Suspense>
          ) : (
            <BddConstructionTableBlock
              columns={tableColumns}
              tableAssets={tableAssets}
              selectedAssetId={selectedAsset?.id}
              onRowClick={handleAssetClick}
              footerTotalCount={footerTotalCount}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </div>
      </div>

      <div
        className={`
                w-full flex-col transition-all duration-300 ease-in-out
                md:w-0
                ${selectedAsset ? 'flex md:w-1/2 lg:w-1/3' : 'hidden'}
            `}
      >
        {selectedAsset && (
          <>
            <div className="p-4 md:p-6 border-b border-siloam-border flex-shrink-0 bg-siloam-surface">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(null)}
                    className="p-2 -ml-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition md:hidden"
                  >
                    <BackIcon />
                  </button>
                  <div className="overflow-hidden">
                    <h2
                      className="text-xl md:text-2xl font-bold text-siloam-text-primary truncate"
                      title={selectedAsset.assetName}
                    >
                      {selectedAsset.assetName}
                    </h2>
                    <p className="text-sm text-siloam-text-secondary truncate">
                      {selectedAsset.assetCode} - {selectedAsset.projectName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition hidden md:block"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm font-medium text-siloam-text-secondary">Priority:</span>
                {(() => {
                  const isUnassigned =
                    !selectedAsset.bddPriority ||
                    selectedAsset.bddPriority === 'unassigned' ||
                    selectedAsset.bddPriority === '';
                  const canEdit = isSuperAdmin || hasBDDRole || !isUnassigned;

                  return (
                    <select
                      value={selectedAsset.bddPriority || ''}
                      onChange={(e) =>
                        handlePriorityChange(
                          selectedAsset.id,
                          (e.target.value as BDDPriority) || null,
                        )
                      }
                      disabled={!canEdit}
                      className={`text-sm border border-siloam-border rounded px-2 py-1 bg-siloam-bg focus:ring-2 focus:ring-siloam-blue ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="">Unassigned</option>
                      {assetTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              <div className="flex items-center space-x-2 mt-4 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => setIsTimelineModalOpen(true)}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-purple-700 transition whitespace-nowrap"
                >
                  Timeline
                </button>
                {canEditAsset && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMomModalOpen(true)}
                      className="bg-siloam-sidebar text-siloam-text-primary px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-border transition whitespace-nowrap"
                    >
                      Add MOM
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdhocTaskModalOpen(true)}
                      className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-blue/90 transition whitespace-nowrap"
                    >
                      Add Adhoc Task
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-siloam-bg/30">
              <Suspense
                fallback={
                  <div className="p-6 space-y-3 animate-pulse">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-16 bg-siloam-border/40 rounded-lg" />
                    ))}
                  </div>
                }
              >
                <AssetTaskTimelineLazy
                  key={`${selectedAsset.id}-${timelineRefreshNonce}`}
                  asset={selectedAsset}
                  project={selectedProject}
                  currentUser={currentUser}
                  onTaskUpdate={handleTaskUpdate}
                />
              </Suspense>
            </div>

            <Suspense fallback={null}>
              <AddMomModalLazy
                isOpen={isMomModalOpen}
                onClose={() => setMomModalOpen(false)}
                assetId={selectedAsset.id}
                currentUser={currentUser}
                onMomAdded={() => {
                  setTimelineRefreshNonce((n) => n + 1);
                  handleTaskUpdate(selectedAsset.id);
                }}
              />
              <AddAdhocTaskModalLazy
                isOpen={isAdhocTaskModalOpen}
                onClose={() => setAdhocTaskModalOpen(false)}
                assetId={selectedAsset.id}
                currentUser={currentUser}
                allUsers={[]}
                onTaskAdded={() => {
                  setTimelineRefreshNonce((n) => n + 1);
                  handleTaskUpdate(selectedAsset.id);
                }}
              />
              <AssetTimelineModalLazy
                isOpen={isTimelineModalOpen}
                onClose={() => setIsTimelineModalOpen(false)}
                asset={selectedAsset}
              />
            </Suspense>
          </>
        )}
      </div>
    </div>
  );
});
