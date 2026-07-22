'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo, useLayoutEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, FileSpreadsheet } from 'lucide-react';
import { EnrichedAsset, User, UserRole, ChangeSummary, Page } from '../../types';
import * as taskService from '../../services/taskService';
import { savePoChangedAssetsViaBackend } from '../../hooks/useAssetUpdateSave';
import { usePermissions } from '../../hooks/usePermissions';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { formatCurrency } from '../../lib/formatter';
import { AssetFilterPanel } from '../../components/organisms/AssetFilterPanel/AssetFilterPanel';
import { queryKeys } from '../../lib/query-keys';
import {
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
} from '../../lib/scopedFilterOptions';
import {
  fetchPoUpdatePageData,
  hydratePoUpdatePageFromDisk,
  readPoUpdateSnapshotAnyAge,
  resolvePoUpdateInitialData,
  type PoUpdatePageData,
} from '../../hooks/queries/fetchPoUpdatePageData';
import { cloneDeep } from '../../lib/clone';
import { useDebouncedValue } from '../BudgetHU/useDebouncedValue';
import {
  type PoSortOption,
  type PoStatusFilter,
  buildPoFilterMaps,
  buildPoChangeSummaryRows,
  diffChangedPoAssets,
  filterAndSortPoAssets,
  preparePoAssetsForSave,
  poDateToTaskCompletedAt,
  shouldTriggerPoCreatedTask,
  normalize,
} from './poUpdateHelpers';
import { QuickPoUpdateModal } from './QuickPoUpdateModal';
import { PoSmartMigrationModal } from './PoSmartMigrationModal';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

interface POUpdatePageProps {
  currentUser: User;
  allRoles: UserRole[];
  periodName: string;
  preloadedSnapshot?: PoUpdatePageData | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onDataChange: () => void;
}

const PO_STATUS_TABS: { value: PoStatusFilter; label: string }[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'hasPO', label: 'Has PO' },
  { value: 'noPO', label: 'No PO' },
];

const PoStatusTabBar = memo(function PoStatusTabBar({
  value,
  onChange,
}: {
  value: PoStatusFilter;
  onChange: (value: PoStatusFilter) => void;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-siloam-text-secondary mb-2">PO Status</h4>
      <div className="flex items-center gap-2 flex-wrap">
        {PO_STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
              value === tab.value
                ? 'bg-siloam-blue text-white shadow-soft'
                : 'bg-siloam-surface text-siloam-text-secondary hover:bg-siloam-border hover:text-siloam-text-primary'
            }`}
          >
            {tab.label}
            {tab.value === 'noPO' && value === 'noPO' ? (
              <span className="ml-1 text-[10px] font-normal opacity-80">(Default)</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
});

type ActiveFilterTag = {
  key: string;
  label: string;
  onRemove: () => void;
};

const PoActiveFilterTags = memo(function PoActiveFilterTags({
  tags,
  onClearAll,
}: {
  tags: ActiveFilterTag[];
  onClearAll: () => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-siloam-border">
      <span className="text-xs font-semibold uppercase tracking-wide text-siloam-text-secondary shrink-0">
        Filter aktif:
      </span>
      {tags.map((tag) => (
        <button
          key={tag.key}
          type="button"
          onClick={tag.onRemove}
          className="inline-flex items-center gap-1 rounded-full bg-siloam-blue/10 px-2.5 py-1 text-xs font-medium text-siloam-blue hover:bg-siloam-blue/20 transition-colors"
          title={`Hapus filter: ${tag.label}`}
        >
          <span>{tag.label}</span>
          <span aria-hidden className="text-siloam-blue/70">
            ×
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto text-xs font-semibold text-siloam-blue hover:text-siloam-blue/80 hover:underline"
      >
        Reset semua filter
      </button>
    </div>
  );
});

const PoExtraFilters = memo(function PoExtraFilters({
  focusNeedingPO,
  focusNotReceived,
  onFocusNeedingPOChange,
  onFocusNotReceivedChange,
}: {
  focusNeedingPO: boolean;
  focusNotReceived: boolean;
  onFocusNeedingPOChange: (checked: boolean) => void;
  onFocusNotReceivedChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <input
          id="focus-po"
          type="checkbox"
          checked={focusNeedingPO}
          onChange={(e) => onFocusNeedingPOChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="focus-po" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Focus on items needing PO
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="focus-gr"
          type="checkbox"
          checked={focusNotReceived}
          onChange={(e) => onFocusNotReceivedChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="focus-gr" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Focus on items not yet Received
        </label>
      </div>
    </div>
  );
});

export const POUpdatePage: React.FC<POUpdatePageProps> = memo(function POUpdatePage({
  currentUser,
  allRoles,
  periodName,
  preloadedSnapshot,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
}) {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.POUpdate, 'view');
  const canEdit = permissions.canOperateOnPage(Page.POUpdate, 'edit');

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedFinishedTasks, setSelectedFinishedTasks] = useState<string[]>([]);
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState<string | null>(null);
  const [completionRange, setCompletionRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 });
  const [poStatusFilter, setPoStatusFilter] = useState<PoStatusFilter>('noPO');
  const [focusNeedingPO, setFocusNeedingPO] = useState(false);
  const [focusNotReceived, setFocusNotReceived] = useState(false);
  const [sortBy] = useState<PoSortOption>('assetName_asc');
  const [meetingFilters, setMeetingFilters] = useState<{ archetype: string | null; assetTypeGroup: string | null }>({
    archetype: null,
    assetTypeGroup: null,
  });

  const resetPoSpecificFilters = useCallback(() => {
    setPoStatusFilter('noPO');
    setFocusNeedingPO(false);
    setFocusNotReceived(false);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedHUs([]);
    setSelectedPriorities([]);
    setSelectedFinishedTasks([]);
    setSelectedBudgetFilter(null);
    setCompletionRange({ min: 0, max: 100 });
    setMeetingFilters({ archetype: null, assetTypeGroup: null });
    resetPoSpecificFilters();
  }, [resetPoSpecificFilters]);

  const [isQuickPoModalOpen, setIsQuickPoModalOpen] = useState(false);
  const [isPoMigrationOpen, setIsPoMigrationOpen] = useState(false);
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

  const [editedData, setEditedData] = useState<EnrichedAsset[]>([]);
  const serverAssetsRef = useRef<EnrichedAsset[]>([]);
  const scopeKeyRef = useRef(`${periodName}:${currentUser.id}`);
  const diskSeedRef = useRef<PoUpdatePageData | undefined>(undefined);

  if (scopeKeyRef.current !== `${periodName}:${currentUser.id}`) {
    scopeKeyRef.current = `${periodName}:${currentUser.id}`;
    diskSeedRef.current = undefined;
  }
  if (diskSeedRef.current === undefined) {
    diskSeedRef.current =
      preloadedSnapshot ??
      (periodName.trim() && currentUser.id
        ? readPoUpdateSnapshotAnyAge(currentUser.id, periodName) ?? undefined
        : undefined);
  }

  const initialPageData = useMemo(
    () =>
      resolvePoUpdateInitialData(queryClient, currentUser.id, periodName) ?? diskSeedRef.current,
    [queryClient, currentUser.id, periodName],
  );

  useLayoutEffect(() => {
    if (!periodName.trim() || !canView) return;
    if (queryClient.getQueryData(queryKeys.poUpdate.page(periodName, currentUser.id))) return;

    hydratePoUpdatePageFromDisk(queryClient, currentUser.id, periodName);
    if (queryClient.getQueryData(queryKeys.poUpdate.page(periodName, currentUser.id))) return;

    if (diskSeedRef.current) {
      queryClient.setQueryData(
        queryKeys.poUpdate.page(periodName, currentUser.id),
        diskSeedRef.current,
      );
    }
  }, [periodName, currentUser.id, canView, queryClient]);

  const poQuery = useQuery({
    queryKey: queryKeys.poUpdate.page(periodName, currentUser.id),
    queryFn: () => fetchPoUpdatePageData(currentUser.id, periodName),
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
    () => (isDirty ? editedData : (poQuery.data?.assets ?? [])),
    [isDirty, editedData, poQuery.data?.assets],
  );

  const masterData = poQuery.data?.masterData ?? {
    archetypes: [],
    hus: [],
    projects: [],
    priorities: [],
  };

  const assetLastTaskMap = useMemo(
    () => new Map(Object.entries(poQuery.data?.assetLastTaskMap ?? {})),
    [poQuery.data?.assetLastTaskMap],
  );

  const assetHasPOMap = useMemo(
    () => new Map(Object.entries(poQuery.data?.assetHasPOMap ?? {})),
    [poQuery.data?.assetHasPOMap],
  );

  const showTableLoading = displayAssets.length === 0 && poQuery.isLoading;
  const isBackgroundRefresh = poQuery.isFetching && displayAssets.length > 0;

  useEffect(() => {
    if (poQuery.isError) {
      console.error('Error loading PO update data:', poQuery.error);
      showToast('Failed to load asset data.', 'error');
    }
  }, [poQuery.isError, poQuery.error, showToast]);

  useEffect(() => {
    if (!poQuery.data?.assets?.length || isDirty) return;
    serverAssetsRef.current = cloneDeep(poQuery.data.assets);
  }, [poQuery.data?.assets, isDirty]);

  const handleDataChange = useCallback(
    (newData: EnrichedAsset[]) => {
      const changesMap = new Map(newData.map((item) => [item.id, item]));
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(poQuery.data?.assets ?? []);
        if (prev.length === 0) {
          serverAssetsRef.current = cloneDeep(poQuery.data?.assets ?? []);
        }
        return base.map((originalItem) =>
          changesMap.has(originalItem.id) ? changesMap.get(originalItem.id)! : originalItem,
        );
      });
      updateIsDirty(true);
    },
    [poQuery.data?.assets, updateIsDirty],
  );

  const handlePOSentToVendorChange = useCallback(
    (assetId: string, isChecked: boolean) => {
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(poQuery.data?.assets ?? []);
        if (prev.length === 0) {
          serverAssetsRef.current = cloneDeep(poQuery.data?.assets ?? []);
        }
        return base.map((asset) => {
          if (asset.id !== assetId) return asset;
          const updatedAsset = { ...asset } as EnrichedAsset & { __poSentToVendorChecked?: boolean };
          if (isChecked && updatedAsset.consumedBudget === 0) {
            updatedAsset.consumedBudget =
              updatedAsset.budgetPlan > 0 ? updatedAsset.budgetPlan * 0.01 : 1000;
          }
          if (isChecked && !updatedAsset.poDate) {
            updatedAsset.poDate = new Date().toISOString().slice(0, 10);
          }
          updatedAsset.__poSentToVendorChecked = isChecked;
          return updatedAsset;
        });
      });
      updateIsDirty(true);
    },
    [poQuery.data?.assets, updateIsDirty],
  );

  const handleSave = useCallback(async () => {
    const preparedData = preparePoAssetsForSave(serverAssetsRef.current, editedData);
    const changedAssets = diffChangedPoAssets(serverAssetsRef.current, preparedData);

    if (changedAssets.length === 0) {
      showToast('No changes to save.', 'success');
      updateIsDirty(false);
      return;
    }

    try {
      const savedViaBe = await savePoChangedAssetsViaBackend(currentUser.id, changedAssets);
      if (!savedViaBe) {
        showToast('Failed to save changes — backend unavailable.', 'error');
        return;
      }

      const originalMap = new Map(serverAssetsRef.current.map((a) => [a.id, a]));
      const assetsToTriggerPO = changedAssets.filter((asset) =>
        shouldTriggerPoCreatedTask(
          asset,
          originalMap.get(asset.id),
          assetHasPOMap.get(asset.id) === true,
        ),
      );
      await Promise.all(
        assetsToTriggerPO.map(async (asset) => {
          await taskService.triggerSystemTask(asset.id, 'PO_CREATED', currentUser, {
            completedAt: poDateToTaskCompletedAt(asset.poDate),
          });
        }),
      );

      showToast(`Successfully updated ${changedAssets.length} asset(s).`, 'success');
      onDataChange();
      updateIsDirty(false);
      serverAssetsRef.current = cloneDeep(preparedData);
      setEditedData([]);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.poUpdate.page(periodName, currentUser.id),
      });
    } catch (error) {
      console.error('Failed to save PO updates:', error);
      showToast('Failed to save changes.', 'error');
    }
  }, [
    editedData,
    currentUser,
    periodName,
    onDataChange,
    showToast,
    queryClient,
    updateIsDirty,
    assetHasPOMap,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData([]);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;
    const rows = buildPoChangeSummaryRows(serverAssetsRef.current, editedData).map((row) => {
      if (row.item.includes('PO Value')) {
        return {
          ...row,
          before: formatCurrency(Number(row.before) || 0),
          after: formatCurrency(Number(row.after) || 0),
        };
      }
      return row;
    });
    if (rows.length === 0) return null;
    return { title: 'PO Updates Summary', changes: rows };
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
      filterAndSortPoAssets(displayAssets, {
        poStatusFilter,
        assetHasPOMap,
        focusNeedingPO,
        focusNotReceived,
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
      poStatusFilter,
      assetHasPOMap,
      focusNeedingPO,
      focusNotReceived,
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
    focusNeedingPO,
    focusNotReceived,
    poStatusFilter,
  ]);

  const columns: SpreadsheetColumn<EnrichedAsset>[] = useMemo(
    () => [
      { header: 'Asset Name', accessor: 'assetName' },
      { header: 'Asset Code', accessor: 'assetCode' },
      { header: 'Project Name', accessor: 'projectName' },
      { header: 'CPR ID', accessor: 'cprId', isEditable: canEdit },
      { header: 'PO Number', accessor: 'poNumber', isEditable: canEdit },
      { header: 'Tgl PO', accessor: 'poDate', isEditable: canEdit, editorType: 'date' },
      { header: 'PO Value (Consumed)', accessor: 'consumedBudget', isNumeric: true, isEditable: canEdit },
      {
        header: 'PO Sent to Vendor',
        accessor: (item) => {
          const hasPOCompleted = assetHasPOMap.get(item.id) || false;
          const checked =
            hasPOCompleted ||
            (item as EnrichedAsset & { __poSentToVendorChecked?: boolean }).__poSentToVendorChecked ||
            false;
          return (
            <div className="flex justify-center items-center h-full px-4 py-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => handlePOSentToVendorChange(item.id, e.target.checked)}
                disabled={!canEdit || hasPOCompleted}
                className="h-5 w-5 text-siloam-blue rounded border-gray-300 focus:ring-siloam-blue disabled:opacity-50"
                title={hasPOCompleted ? 'PO already sent to vendor (from task log)' : 'Mark as PO sent to vendor'}
              />
            </div>
          );
        },
      },
    ],
    [canEdit, assetHasPOMap, handlePOSentToVendorChange],
  );

  const handleMeetingFilterChange = useCallback(
    (next: { archetype: string | null; assetTypeGroup: string | null }) => {
      const archetypeChanged = meetingFilters.archetype !== next.archetype;
      setMeetingFilters(next);

      if (!archetypeChanged) return;

      if (!next.archetype) {
        setSelectedHUs([]);
        return;
      }

      const arch = masterData.archetypes.find(
        (a) => normalize(a.name) === normalize(next.archetype),
      );
      if (!arch) {
        setSelectedHUs([]);
        return;
      }

      const allowed = new Set(
        masterData.hus
          .filter((hu) => String(hu.archetypeId) === String(arch.id))
          .map((hu) => hu.name),
      );
      setSelectedHUs((prev) => prev.filter((name) => allowed.has(name)));
    },
    [meetingFilters.archetype, masterData.archetypes, masterData.hus],
  );

  const scopedArchetypeOptions = useMemo(
    () =>
      buildScopedArchetypeOptions(
        masterData.archetypes,
        permissions.userScopes,
        masterData.hus,
      ),
    [masterData.archetypes, masterData.hus, permissions.userScopes],
  );

  const assetTypeGroupOptions = useMemo(() => {
    const names = new Set<string>();
    displayAssets.forEach((asset) => {
      const name = asset.assetTypeGroupName?.trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [displayAssets]);

  useEffect(() => {
    if (
      meetingFilters.archetype &&
      scopedArchetypeOptions.length > 0 &&
      !scopedArchetypeOptions.some(
        (name) => normalize(name) === normalize(meetingFilters.archetype),
      )
    ) {
      handleMeetingFilterChange({
        archetype: null,
        assetTypeGroup: meetingFilters.assetTypeGroup,
      });
    }
  }, [
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    scopedArchetypeOptions,
    handleMeetingFilterChange,
  ]);

  useEffect(() => {
    if (
      meetingFilters.assetTypeGroup &&
      assetTypeGroupOptions.length > 0 &&
      !assetTypeGroupOptions.some(
        (name) => normalize(name) === normalize(meetingFilters.assetTypeGroup),
      )
    ) {
      handleMeetingFilterChange({
        archetype: meetingFilters.archetype,
        assetTypeGroup: null,
      });
    }
  }, [
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    assetTypeGroupOptions,
    handleMeetingFilterChange,
  ]);

  const priorityOptions = useMemo(
    () => Array.from(new Set(masterData.priorities.map((p) => p.name))),
    [masterData.priorities],
  );

  const finishedTaskOptions = useMemo(
    () => Array.from(new Set(assetLastTaskMap.values())).sort((a, b) => a.localeCompare(b)),
    [assetLastTaskMap],
  );

  const huOptions = useMemo(() => {
    let hus = masterData.hus;
    if (meetingFilters.archetype) {
      const arch = masterData.archetypes.find(
        (a) => normalize(a.name) === normalize(meetingFilters.archetype),
      );
      if (arch) {
        hus = hus.filter((hu) => String(hu.archetypeId) === String(arch.id));
      }
    }
    const scoped = buildScopedHuOptions(hus, masterData.archetypes, permissions.userScopes);
    if (scoped.length > 0) return scoped;
    if (masterData.hus.length > 0) return [];
    return Array.from(new Set(displayAssets.map((a) => a.huName).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [
    masterData.hus,
    masterData.archetypes,
    meetingFilters.archetype,
    permissions.userScopes,
    displayAssets,
  ]);

  const hasActivePanelFilters = useMemo(
    () =>
      Boolean(debouncedSearch.trim()) ||
      selectedHUs.length > 0 ||
      selectedPriorities.length > 0 ||
      selectedFinishedTasks.length > 0 ||
      selectedBudgetFilter != null ||
      completionRange.min > 0 ||
      completionRange.max < 100 ||
      meetingFilters.archetype != null ||
      meetingFilters.assetTypeGroup != null ||
      poStatusFilter !== 'noPO' ||
      focusNeedingPO ||
      focusNotReceived,
    [
      debouncedSearch,
      selectedHUs.length,
      selectedPriorities.length,
      selectedFinishedTasks.length,
      selectedBudgetFilter,
      completionRange.min,
      completionRange.max,
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      poStatusFilter,
      focusNeedingPO,
      focusNotReceived,
    ],
  );

  const activeFilterTags = useMemo((): ActiveFilterTag[] => {
    const tags: ActiveFilterTag[] = [];

    if (debouncedSearch.trim()) {
      tags.push({
        key: 'search',
        label: `Search: "${debouncedSearch.trim()}"`,
        onRemove: () => setSearchTerm(''),
      });
    }
    if (meetingFilters.archetype) {
      tags.push({
        key: 'archetype',
        label: `Network: ${meetingFilters.archetype}`,
        onRemove: () =>
          handleMeetingFilterChange({
            archetype: null,
            assetTypeGroup: meetingFilters.assetTypeGroup,
          }),
      });
    }
    if (meetingFilters.assetTypeGroup) {
      tags.push({
        key: 'assetTypeGroup',
        label: `Asset Group: ${meetingFilters.assetTypeGroup}`,
        onRemove: () =>
          handleMeetingFilterChange({
            archetype: meetingFilters.archetype,
            assetTypeGroup: null,
          }),
      });
    }
    selectedHUs.forEach((hu) => {
      tags.push({
        key: `hu-${hu}`,
        label: `HU: ${hu}`,
        onRemove: () => setSelectedHUs((prev) => prev.filter((name) => name !== hu)),
      });
    });
    selectedPriorities.forEach((priority) => {
      tags.push({
        key: `priority-${priority}`,
        label: `Priority: ${priority}`,
        onRemove: () => setSelectedPriorities((prev) => prev.filter((name) => name !== priority)),
      });
    });
    selectedFinishedTasks.forEach((task) => {
      tags.push({
        key: `task-${task}`,
        label: `Task: ${task}`,
        onRemove: () => setSelectedFinishedTasks((prev) => prev.filter((name) => name !== task)),
      });
    });
    if (selectedBudgetFilter === 'low') {
      tags.push({
        key: 'budget-low',
        label: 'Budget: ≤ 300 juta',
        onRemove: () => setSelectedBudgetFilter(null),
      });
    }
    if (selectedBudgetFilter === 'high') {
      tags.push({
        key: 'budget-high',
        label: 'Budget: > 300 juta',
        onRemove: () => setSelectedBudgetFilter(null),
      });
    }
    if (completionRange.min > 0 || completionRange.max < 100) {
      tags.push({
        key: 'completion',
        label: `Completion: ${completionRange.min}–${completionRange.max}%`,
        onRemove: () => setCompletionRange({ min: 0, max: 100 }),
      });
    }
    if (poStatusFilter !== 'noPO') {
      const statusLabel = PO_STATUS_TABS.find((tab) => tab.value === poStatusFilter)?.label ?? poStatusFilter;
      tags.push({
        key: 'poStatus',
        label: `PO Status: ${statusLabel}`,
        onRemove: () => setPoStatusFilter('noPO'),
      });
    }
    if (focusNeedingPO) {
      tags.push({
        key: 'focus-po',
        label: 'Butuh PO',
        onRemove: () => setFocusNeedingPO(false),
      });
    }
    if (focusNotReceived) {
      tags.push({
        key: 'focus-gr',
        label: 'Belum Received',
        onRemove: () => setFocusNotReceived(false),
      });
    }

    return tags;
  }, [
    debouncedSearch,
    meetingFilters.archetype,
    meetingFilters.assetTypeGroup,
    selectedHUs,
    selectedPriorities,
    selectedFinishedTasks,
    selectedBudgetFilter,
    completionRange.min,
    completionRange.max,
    poStatusFilter,
    focusNeedingPO,
    focusNotReceived,
    handleMeetingFilterChange,
  ]);

  const lookupAssets = useMemo(
    () => (isDirty ? editedData : (poQuery.data?.assets ?? [])),
    [isDirty, editedData, poQuery.data?.assets],
  );

  if (!canView) {
    return <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Purchase Order & Goods Received Updates</h2>
          {!showTableLoading && displayAssets.length > 0 ? (
            <p className="text-xs text-siloam-text-secondary mt-1">
              {displayAssets.length} asset{displayAssets.length === 1 ? '' : 's'}
              {filteredAndSortedData.length !== displayAssets.length
                ? ` · ${filteredAndSortedData.length} ditampilkan setelah filter`
                : ''}
            </p>
          ) : null}
        </div>
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

      <div className="bg-siloam-surface rounded-xl shadow-soft">
        <AssetFilterPanel
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          toolbarLeading={
            canEdit ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickPoModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                  aria-label="Quick edit PO"
                >
                  <Zap className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Quick PO</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPoMigrationOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
                  aria-label="Smart migration PO from Excel"
                >
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Smart Migration</span>
                </button>
              </div>
            ) : null
          }
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
          archetypeOptions={scopedArchetypeOptions}
          assetTypeGroupOptions={assetTypeGroupOptions}
          selectedArchetype={meetingFilters.archetype}
          selectedAssetTypeGroup={meetingFilters.assetTypeGroup}
          onMeetingFilterChange={handleMeetingFilterChange}
          hasActiveFilters={hasActivePanelFilters}
          onExtraReset={resetPoSpecificFilters}
        />
      </div>
      <div className="bg-siloam-surface rounded-xl shadow-soft p-4 relative">
        <div className="space-y-4">
          <PoStatusTabBar value={poStatusFilter} onChange={setPoStatusFilter} />
          <PoExtraFilters
            focusNeedingPO={focusNeedingPO}
            focusNotReceived={focusNotReceived}
            onFocusNeedingPOChange={setFocusNeedingPO}
            onFocusNotReceivedChange={setFocusNotReceived}
          />
          <PoActiveFilterTags tags={activeFilterTags} onClearAll={clearAllFilters} />
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
        {showTableLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-siloam-border border-t-siloam-blue animate-spin"
              aria-hidden
            />
            <span>Memuat data aset…</span>
          </div>
        ) : filteredAndSortedData.length === 0 ? (
          <div className="py-12 text-center text-sm text-siloam-text-secondary space-y-3">
            <p>Tidak ada asset yang cocok dengan filter saat ini.</p>
            {hasActivePanelFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-siloam-blue font-semibold hover:underline"
              >
                Reset semua filter
              </button>
            ) : (
              <p>Belum ada data asset untuk periode ini.</p>
            )}
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

      {canEdit ? (
        <QuickPoUpdateModal
          isOpen={isQuickPoModalOpen}
          onClose={() => setIsQuickPoModalOpen(false)}
          onSuccess={(assetIds) => {
            const n = assetIds.length;
            showToast(n === 1 ? '1 PO berhasil diperbarui.' : `${n} PO berhasil diperbarui.`, 'success');
            onDataChange();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.poUpdate.page(periodName, currentUser.id),
            });
          }}
          currentUser={currentUser}
          lookupAssets={lookupAssets}
          assetHasPOMap={assetHasPOMap}
        />
      ) : null}

      {canEdit ? (
        <PoSmartMigrationModal
          isOpen={isPoMigrationOpen}
          onClose={() => setIsPoMigrationOpen(false)}
          onSuccess={() => {
            onDataChange();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.poUpdate.page(periodName, currentUser.id),
            });
          }}
          currentUser={currentUser}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
});

POUpdatePage.displayName = 'POUpdatePage';
