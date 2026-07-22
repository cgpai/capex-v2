'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EnrichedAsset, User, UserRole, ChangeSummary, Page } from '../../types';
import * as taskService from '../../services/taskService';
import { saveGrChangedAssetsViaBackend } from '../../hooks/useAssetUpdateSave';
import { usePermissions } from '../../hooks/usePermissions';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { AssetFilterPanel } from '../../components/organisms/AssetFilterPanel/AssetFilterPanel';
import { MeetingFilterBar } from '../../components/organisms/MeetingFilterBar/MeetingFilterBar';
import { queryKeys } from '../../lib/query-keys';
import {
  fetchGrUpdatePageData,
  resolveGrUpdateInitialData,
} from '../../hooks/queries/fetchGrUpdatePageData';
import { cloneDeep } from '../../lib/clone';
import { useDebouncedValue } from '../BudgetHU/useDebouncedValue';
import {
  type GrSortOption,
  type GrStatusFilter,
  buildPoFilterMaps,
  collectGrAssetChanges,
  filterAndSortGrAssets,
  getGRNStatus,
} from './grUpdateHelpers';
import { taskHasTriggerEvent } from '../../lib/systemTriggerEvents';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

interface GRUpdatePageProps {
  currentUser: User;
  allRoles: UserRole[];
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onDataChange: () => void;
}

export const GRUpdatePage: React.FC<GRUpdatePageProps> = memo(function GRUpdatePage({
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
}) {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.GRUpdate, 'view');
  const canEdit = permissions.canOperateOnPage(Page.GRUpdate, 'edit');

  const [editedData, setEditedData] = useState<EnrichedAsset[]>([]);
  const serverAssetsRef = useRef<EnrichedAsset[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedFinishedTasks, setSelectedFinishedTasks] = useState<string[]>([]);
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState<string | null>(null);
  const [completionRange, setCompletionRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 });
  const [grStatusFilter, setGrStatusFilter] = useState<GrStatusFilter>('all');
  const [sortBy] = useState<GrSortOption>('assetName_asc');
  const [meetingFilters, setMeetingFilters] = useState<{ archetype: string | null; assetTypeGroup: string | null }>({
    archetype: null,
    assetTypeGroup: null,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  const [isDirty, setIsDirtyInternal] = useState(false);
  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const initialPageData = useMemo(
    () => resolveGrUpdateInitialData(queryClient, currentUser.id),
    [queryClient, currentUser.id],
  );

  const grQuery = useQuery({
    queryKey: queryKeys.grUpdate.page(currentUser.id),
    queryFn: () => fetchGrUpdatePageData(currentUser.id),
    enabled: canView,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    initialData: initialPageData,
    initialDataUpdatedAt: initialPageData ? Date.now() - STALE_MS - 1 : undefined,
    placeholderData: (prev) => prev,
  });

  const displayAssets = useMemo(
    () => (isDirty ? editedData : (grQuery.data?.assets ?? [])),
    [isDirty, editedData, grQuery.data?.assets],
  );

  const masterData = grQuery.data?.masterData ?? {
    archetypes: [],
    hus: [],
    projects: [],
    priorities: [],
  };

  const assetLastTaskMap = useMemo(
    () => new Map(Object.entries(grQuery.data?.assetLastTaskMap ?? {})),
    [grQuery.data?.assetLastTaskMap],
  );

  const showTableLoading = displayAssets.length === 0 && (grQuery.isPending || grQuery.isFetching);
  const isBackgroundRefresh = grQuery.isFetching && displayAssets.length > 0;

  useEffect(() => {
    if (grQuery.isError) {
      console.error('Error loading GR update data:', grQuery.error);
      showToast('Failed to load asset data.', 'error');
    }
  }, [grQuery.isError, grQuery.error, showToast]);

  useEffect(() => {
    if (!grQuery.data?.assets?.length || isDirty) return;
    serverAssetsRef.current = cloneDeep(grQuery.data.assets);
  }, [grQuery.data?.assets, isDirty]);

  const handleDataChange = useCallback(
    (updatedData: EnrichedAsset[]) => {
      const changesMap = new Map(updatedData.map((item) => [item.id, item]));
      const applyRow = (asset: EnrichedAsset) => {
        const patch = changesMap.get(asset.id);
        const row = patch ?? asset;
        const orderedQty = (row as EnrichedAsset & { qty?: number }).qty || 1;
        let receivedQty = (row as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
        receivedQty = Math.max(0, Math.min(orderedQty, receivedQty));
        return {
          ...row,
          receivedQty,
          isGoodsReceived: receivedQty === orderedQty && receivedQty > 0,
        };
      };

      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(grQuery.data?.assets ?? []);
        if (prev.length === 0) {
          serverAssetsRef.current = cloneDeep(grQuery.data?.assets ?? []);
        }
        return base.map(applyRow);
      });
      updateIsDirty(true);
    },
    [grQuery.data?.assets, updateIsDirty],
  );

  const handleMarkReceivedChange = useCallback(
    (assetId: string, isReceived: boolean) => {
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(grQuery.data?.assets ?? []);
        if (prev.length === 0) {
          serverAssetsRef.current = cloneDeep(grQuery.data?.assets ?? []);
        }
        return base.map((asset) => {
          if (asset.id !== assetId) return asset;
          const orderedQty = (asset as EnrichedAsset & { qty?: number }).qty || 1;
          const receivedQty = isReceived ? orderedQty : 0;
          return {
            ...asset,
            isGoodsReceived: isReceived,
            receivedQty,
            __markReceivedChecked: isReceived,
          } as EnrichedAsset & { __markReceivedChecked?: boolean };
        });
      });
      updateIsDirty(true);
    },
    [grQuery.data?.assets, updateIsDirty],
  );

  const handleSave = useCallback(async () => {
    const changedAssetMap = collectGrAssetChanges(serverAssetsRef.current, editedData);
    const changedAssets = Array.from(changedAssetMap.keys())
      .map((id) => editedData.find((a) => a.id === id)!)
      .filter(Boolean);

    if (changedAssets.length === 0) {
      showToast('No changes to save.', 'success');
      updateIsDirty(false);
      return;
    }

    try {
      const savedViaBe = await saveGrChangedAssetsViaBackend(currentUser.id, changedAssets);
      if (!savedViaBe) {
        showToast('Failed to save changes — backend unavailable.', 'error');
        return;
      }

      const assetsToCompleteGRN = changedAssets.filter((asset) => {
        const originalAsset = serverAssetsRef.current.find((a) => a.id === asset.id);
        if (!originalAsset) return false;
        const wasGrnChecked =
          (originalAsset as EnrichedAsset & { __grnStatusChecked?: boolean }).__grnStatusChecked || false;
        const isNowGrnChecked =
          (asset as EnrichedAsset & { __grnStatusChecked?: boolean }).__grnStatusChecked || false;
        return !wasGrnChecked && isNowGrnChecked;
      });

      if (assetsToCompleteGRN.length > 0) {
        const allTasks = grQuery.data?.tasks ?? [];
        const grnTask = allTasks.find((task) => {
          const taskNameLower = task.name.toLowerCase();
          return (
            taskNameLower.includes('grn') ||
            taskNameLower.includes('good received') ||
            taskNameLower.includes('goods received') ||
            taskHasTriggerEvent(task, 'PO_GOODS_RECEIVED')
          );
        });

        const userRole = allRoles.find((r) =>
          currentUser.assignments.some((a) => a.roleName === r.roleName),
        );

        if (grnTask && userRole) {
          await Promise.all(
            assetsToCompleteGRN.map((asset) =>
              taskService.markTaskAsDone(
                asset.id,
                grnTask.id,
                'GRN completed via GR Update page',
                currentUser,
                userRole,
              ),
            ),
          );
        }
      }

      const successMessage = `Successfully updated ${changedAssets.length} asset(s).${
        assetsToCompleteGRN.length > 0 ? ` Completed GRN task for ${assetsToCompleteGRN.length} asset(s).` : ''
      }`;
      showToast(successMessage, 'success');
      setEditedData([]);
      updateIsDirty(false);
      onDataChange();
      await queryClient.invalidateQueries({ queryKey: queryKeys.grUpdate.page(currentUser.id) });
    } catch (error) {
      console.error('Failed to save GR updates:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save changes.';
      showToast(`Failed to save changes: ${errorMessage}`, 'error');
    }
  }, [editedData, currentUser, allRoles, grQuery.data?.tasks, onDataChange, showToast, queryClient, updateIsDirty]);

  const handleCancel = useCallback(() => {
    setEditedData([]);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;

    const originalAssetsMap = new Map(serverAssetsRef.current.map((a) => [a.id, a]));
    const changes: { item: string; before: string; after: string }[] = [];

    editedData.forEach((editedAsset) => {
      const originalAsset = originalAssetsMap.get(editedAsset.id);
      if (!originalAsset) return;

      if (!!originalAsset.isGoodsReceived !== !!editedAsset.isGoodsReceived) {
        changes.push({
          item: `${editedAsset.assetName} GR Status`,
          before: originalAsset.isGoodsReceived ? 'Received' : 'Not Received',
          after: editedAsset.isGoodsReceived ? 'Received' : 'Not Received',
        });
      }

      const originalReceivedQty = (originalAsset as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
      const editedReceivedQty = (editedAsset as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
      if (originalReceivedQty !== editedReceivedQty) {
        changes.push({
          item: `${editedAsset.assetName} Received QTY`,
          before: String(originalReceivedQty),
          after: String(editedReceivedQty),
        });
      }
    });

    if (changes.length === 0) return null;
    return { title: 'GR Updates Summary', changes };
  }, [isDirty, editedData]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const filterMaps = useMemo(
    () =>
      buildPoFilterMaps(
        masterData.projects as { id: string; priorityId: string; approvedBudget: number; budgetPlan: number }[],
        masterData.priorities,
      ),
    [masterData.projects, masterData.priorities],
  );

  const filteredAndSortedData = useMemo(
    () =>
      filterAndSortGrAssets(displayAssets, {
        grStatusFilter,
        debouncedSearch,
        selectedHUs,
        selectedPriorities,
        selectedFinishedTasks,
        selectedBudgetFilter,
        completionRange,
        sortBy,
        meetingFilters,
        assetLastTaskMap,
        filterMaps,
      }),
    [
      displayAssets,
      grStatusFilter,
      debouncedSearch,
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      completionRange,
      sortBy,
      meetingFilters,
      assetLastTaskMap,
      filterMaps,
    ],
  );

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedData, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedData.length / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    selectedHUs,
    selectedPriorities,
    selectedFinishedTasks,
    selectedBudgetFilter,
    completionRange,
    meetingFilters,
    grStatusFilter,
  ]);

  const columns: SpreadsheetColumn<EnrichedAsset>[] = useMemo(
    () => [
      { header: 'Asset Name', accessor: 'assetName' },
      { header: 'Asset Code', accessor: 'assetCode' },
      { header: 'Project Name', accessor: 'projectName' },
      { header: 'PO Number', accessor: 'poNumber' },
      { header: 'Ordered QTY', accessor: (item) => (item as EnrichedAsset & { qty?: number }).qty || 1 },
      {
        header: 'Received QTY',
        accessor: 'receivedQty' as keyof EnrichedAsset,
        isEditable: canEdit,
        editorType: 'number',
      },
      {
        header: 'GRN Status',
        accessor: (item) => {
          const status = getGRNStatus(item);
          return (
            <span className={`px-2 py-1 rounded text-xs font-semibold ${status.bg} ${status.color}`}>
              {status.text}
            </span>
          );
        },
      },
      {
        header: 'Mark Received',
        accessor: (item) => {
          const orderedQty = (item as EnrichedAsset & { qty?: number }).qty || 1;
          const receivedQty = (item as EnrichedAsset & { receivedQty?: number }).receivedQty || 0;
          const isFullyReceived = receivedQty === orderedQty && receivedQty > 0;
          const isChecked = item.isGoodsReceived || isFullyReceived;
          return (
            <div className="flex justify-center items-center h-full px-4 py-3">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => handleMarkReceivedChange(item.id, e.target.checked)}
                disabled={!canEdit}
                className="h-5 w-5 text-siloam-green rounded border-gray-300 focus:ring-siloam-green"
                title={isFullyReceived ? 'Fully received' : 'Mark as received'}
              />
            </div>
          );
        },
      },
    ],
    [canEdit, handleMarkReceivedChange],
  );

  const priorityOptions = useMemo(
    () => Array.from(new Set(masterData.priorities.map((p) => p.name))),
    [masterData.priorities],
  );

  const finishedTaskOptions = useMemo(
    () => Array.from(new Set(assetLastTaskMap.values())),
    [assetLastTaskMap],
  );

  const huOptions = useMemo(() => {
    if (masterData.hus.length > 0) return masterData.hus.map((h) => h.name);
    return Array.from(new Set(displayAssets.map((a) => a.huName).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [masterData.hus, displayAssets]);

  if (!canView) {
    return <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>;
  }

  const showEmptyState = grQuery.isFetched && displayAssets.length === 0 && !showTableLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Goods Received (GR) Update</h2>
        {isDirty && canEdit && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>

      <MeetingFilterBar onFilterChange={setMeetingFilters} />
      <AssetFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        huOptions={huOptions}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        completionRange={completionRange}
        setCompletionRange={setCompletionRange}
        priorityOptions={priorityOptions}
        selectedPriorities={selectedPriorities}
        setSelectedPriorities={setSelectedPriorities}
        finishedTaskOptions={finishedTaskOptions}
        selectedFinishedTasks={selectedFinishedTasks}
        setSelectedFinishedTasks={setSelectedFinishedTasks}
        selectedBudgetFilter={selectedBudgetFilter}
        setSelectedBudgetFilter={setSelectedBudgetFilter}
      />
      <div className="bg-siloam-surface rounded-xl shadow-soft p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-siloam-text-primary">GR Status:</label>
            <div className="flex items-center gap-4 flex-wrap">
              {(
                [
                  ['all', 'All Assets'],
                  ['notReceived', 'Not Received'],
                  ['partiallyReceived', 'Partially Received'],
                  ['fullyReceived', 'Fully Received'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    name="grStatus"
                    value={value}
                    checked={grStatusFilter === value}
                    onChange={() => setGrStatusFilter(value)}
                    className="h-4 w-4 text-siloam-blue border-siloam-border focus:ring-siloam-blue"
                  />
                  <span className="ml-2 text-sm text-siloam-text-primary">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-siloam-surface rounded-xl shadow-soft p-6 relative min-h-[12rem]">
        {isBackgroundRefresh ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-siloam-border"
              aria-hidden
            >
              <div className="h-full w-1/3 rounded-full bg-siloam-blue/70 animate-pulse" />
            </div>
            <div className="pointer-events-none absolute right-3 top-2 z-10 rounded border border-siloam-border bg-siloam-bg/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary">
              Sinkron
            </div>
          </>
        ) : null}
        {showEmptyState ? (
          <div className="py-12 text-center text-siloam-text-secondary">
            <p className="mb-4">No assets found that need GRN update.</p>
            <p className="text-sm">
              Assets will appear here if they have:
              <ul className="mt-2 list-inside list-disc text-left">
                <li>PO Number, OR</li>
                <li>Goods Received status, OR</li>
                <li>Consumed Budget &gt; 0</li>
              </ul>
              <span className="mt-2 block">And their GRN task is not yet completed.</span>
            </p>
          </div>
        ) : showTableLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-siloam-border border-t-siloam-blue animate-spin"
              aria-hidden
            />
            <span>Memuat data aset…</span>
          </div>
        ) : (
          <SpreadsheetTable
            columns={columns}
            data={paginatedData}
            onDataChange={handleDataChange}
            rowHeaderAccessor="assetName"
          />
        )}
      </div>

      {filteredAndSortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
          <div className="text-sm text-siloam-text-secondary">
            Showing {(currentPage - 1) * itemsPerPage + 1} -{' '}
            {Math.min(currentPage * itemsPerPage, filteredAndSortedData.length)} of{' '}
            {filteredAndSortedData.length} assets
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-siloam-text-secondary">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              >
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                >
                  Previous
                </button>
                <span className="text-sm text-siloam-text-secondary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

GRUpdatePage.displayName = 'GRUpdatePage';
