'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  recalculateBudgets,
  saveArchetypeBudgetPlans,
} from '../services/budgetService';
import {
  BudgetPeriod,
  BudgetItem,
  BudgetCategoryConfig,
  User,
  UserRole,
  ChangeSummary,
  BudgetSummaryRow,
  Archetype,
  Page,
} from '../types';
import { SpreadsheetTable, SpreadsheetColumn } from '../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { usePermissions } from '../hooks/usePermissions';
import { formatCurrency } from '../lib/formatter';
import { BudgetSummary } from '../components/organisms/BudgetSummary/BudgetSummary';
import { BudgetSummaryCard } from '../components/molecules/BudgetSummaryCard/BudgetSummaryCard';
import { EditPlanModal } from '../components/organisms/EditPlanModal/EditPlanModal';
import { Dropdown } from '../components/molecules/Dropdown/Dropdown';
import { queryKeys } from '../lib/query-keys';
import { fetchBudgetSiloamShellBundle, fetchBudgetSiloamCategorySlice } from '../hooks/queries/fetchBudgetSiloamPeriod';
import { mergeBudgetNetworkCategorySlice, resolveDefaultBudgetCategoryId, shellSummaryUsesStoredAggregates } from '../lib/budgetSiloamCategoryMerge';
import { cloneDeep } from '../lib/clone';
import { invalidateRequestCache } from '../lib/requestCache';
import { invalidateBudgetHuBackendCache } from '../services/budgetHuPageApi';
import { readPeriodShellCache, writePeriodShellCache } from '../lib/periodSelectionCache';
import { collectArchetypePlanChanges } from '../lib/budgetArchetypePlanEdits';
import { BudgetSiloamPageSkeleton } from './BudgetSiloam/BudgetSiloamPageSkeleton';
import { sumArchetypeCategoryLiveAggregates } from '../lib/budgetCategoryAggregates';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const QUERY_HYDRATE_BLOCK_MS = 3_000;

function emptyBudgetItem(): BudgetItem {
  return {
    budgetPlan: 0,
    budgetCarryForward: 0,
    budgetAllocated: 0,
    approvedBudget: 0,
    consumedBudget: 0,
    assetCount: 0,
    noBudgetAssetCount: 0,
  };
}

interface BudgetPeriodPageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onBudgetPeriodSaved?: (next: BudgetPeriod) => void;
}

interface ArchetypeBudgetRow extends Archetype {
  budgetPlanForCategory?: number;
  budgetCarryForwardForCategory?: number;
  budgetAllocatedForCategory?: number;
  remainingToAllocateForCategory?: number;
  approvedBudgetForCategory?: number;
  consumedBudgetForCategory?: number;
  remainingBudgetForCategory?: number;
}

const BudgetPeriodPageInner: React.FC<BudgetPeriodPageProps> = ({
  periodName,
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
  onBudgetPeriodSaved,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.BudgetPeriod, 'view');
  const canEdit = permissions.canOperateOnPage(Page.BudgetPeriod, 'edit');

  const [editedData, setEditedData] = useState<BudgetPeriod | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSummaryCompact, setIsSummaryCompact] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingArchetypeForModal, setEditingArchetypeForModal] = useState<Archetype | null>(null);
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tableRevision, setTableRevision] = useState(0);

  const serverPeriodRef = useRef<BudgetPeriod | null>(null);
  const blockQueryHydrateUntilRef = useRef(0);

  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const [loadedCategoryIds, setLoadedCategoryIds] = useState<Set<string>>(() => new Set());
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

  const shellQuery = useQuery({
    queryKey: queryKeys.budgetSiloamPeriod.shell(periodName),
    queryFn: () => fetchBudgetSiloamShellBundle(periodName, currentUser.id),
    enabled: !!periodName.trim() && canView && !!currentUser?.id,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const categoryQuery = useQuery({
    queryKey: queryKeys.budgetSiloamPeriod.category(periodName, selectedCategoryId ?? ''),
    queryFn: () =>
      fetchBudgetSiloamCategorySlice(periodName, selectedCategoryId as string, currentUser.id),
    enabled: !!periodName.trim() && canView && !!currentUser?.id && !!selectedCategoryId,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const budgetPeriod = shellQuery.data?.budgetPeriod ?? null;
  const allCategories = shellQuery.data?.categories ?? [];
  const isInitialLoad = shellQuery.isPending && !shellQuery.data;
  const isBackgroundRefresh = shellQuery.isFetching && !!shellQuery.data;
  const isCategoryLoading =
    !!selectedCategoryId &&
    (categoryQuery.isFetching || categoryQuery.isPending) &&
    !loadedCategoryIds.has(selectedCategoryId);

  useEffect(() => {
    if (Date.now() < blockQueryHydrateUntilRef.current) return;
    if (!shellQuery.data?.budgetPeriod) {
      if (!shellQuery.isPending && !serverPeriodRef.current) {
        setEditedData(null);
      }
      return;
    }
    if (isDirty) return;

    const next = recalculateBudgets(cloneDeep(shellQuery.data.budgetPeriod));
    serverPeriodRef.current = cloneDeep(shellQuery.data.budgetPeriod);
    setEditedData(next);
    setSaveError(null);
    setLoadedCategoryIds(new Set());
    updateIsDirty(false);
  }, [shellQuery.data, shellQuery.isPending, isDirty, updateIsDirty]);

  useEffect(() => {
    if (!selectedCategoryId || !categoryQuery.data || isDirty) return;
    setEditedData((prev) => {
      if (!prev) return prev;
      return mergeBudgetNetworkCategorySlice(prev, categoryQuery.data!, selectedCategoryId);
    });
    setLoadedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
    setPendingCategoryId(null);
  }, [categoryQuery.data, selectedCategoryId, isDirty]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    if (categoryQuery.isError) {
      setPendingCategoryId(null);
    }
  }, [categoryQuery.isError, selectedCategoryId]);

  useEffect(() => {
    if (!allCategories.length || selectedCategoryId) return;
    const defaultId = resolveDefaultBudgetCategoryId(allCategories);
    if (defaultId) {
      setSelectedCategoryId(defaultId);
      setPendingCategoryId(defaultId);
    }
  }, [allCategories, selectedCategoryId]);

  useEffect(() => {
    if (!periodName.trim()) {
      setSaveError(null);
      updateIsDirty(false);
      setEditedData(null);
      setSelectedCategoryId(null);
      setLoadedCategoryIds(new Set());
      setPendingCategoryId(null);
    }
  }, [periodName, updateIsDirty]);

  const handleCategorySelect = useCallback((categoryId: string) => {
    if (categoryId === selectedCategoryId) return;
    setPendingCategoryId(categoryId);
    setSelectedCategoryId(categoryId);
  }, [selectedCategoryId]);

  const handleArchetypeDataChange = useCallback(
    (newData: ArchetypeBudgetRow[]) => {
      if (!editedData || !selectedCategoryId) return;
      const newEditedData = cloneDeep(editedData);

      newData.forEach((archRow) => {
        const archToUpdate = newEditedData.archetypes.find((a: Archetype) => a.id === archRow.id);
        if (!archToUpdate) return;
        if (!archToUpdate.budget[selectedCategoryId]) {
          archToUpdate.budget[selectedCategoryId] = emptyBudgetItem();
        }
        archToUpdate.budget[selectedCategoryId].budgetPlan = archRow.budgetPlanForCategory ?? 0;
      });

      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
    },
    [editedData, selectedCategoryId, updateIsDirty],
  );

  const handleSave = useCallback(async () => {
    if (!editedData || !periodName || !serverPeriodRef.current) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const recalculated = recalculateBudgets(editedData);
      const categoryIds = allCategories.map((c) => c.id);
      const pendingRows = collectArchetypePlanChanges(
        serverPeriodRef.current,
        recalculated,
        categoryIds,
      );
      if (!pendingRows.length) {
        throw new Error('Tidak ada perubahan budget network untuk disimpan.');
      }
      await saveArchetypeBudgetPlans(
        recalculated,
        serverPeriodRef.current,
        currentUser.id,
        categoryIds,
      );

      blockQueryHydrateUntilRef.current = Date.now() + QUERY_HYDRATE_BLOCK_MS;
      const next = cloneDeep(recalculated);
      serverPeriodRef.current = cloneDeep(next);
      setEditedData(cloneDeep(next));
      updateIsDirty(false);

      invalidateRequestCache('budget:');
      invalidateRequestCache('budget-siloam:');
      await invalidateBudgetHuBackendCache(periodName, currentUser.id);

      const freshShell = await fetchBudgetSiloamShellBundle(periodName, currentUser.id, {
        skipCache: true,
      });
      let confirmed = freshShell.budgetPeriod ? cloneDeep(freshShell.budgetPeriod) : next;
      if (selectedCategoryId) {
        const freshCat = await fetchBudgetSiloamCategorySlice(
          periodName,
          selectedCategoryId,
          currentUser.id,
          { skipCache: true },
        );
        if (freshCat) {
          confirmed = mergeBudgetNetworkCategorySlice(confirmed, freshCat, selectedCategoryId);
        }
      }
      const categories = freshShell.categories.length ? freshShell.categories : allCategories;

      serverPeriodRef.current = cloneDeep(confirmed);
      setEditedData(cloneDeep(confirmed));
      setLoadedCategoryIds(selectedCategoryId ? new Set([selectedCategoryId]) : new Set());
      setTableRevision((v) => v + 1);
      queryClient.setQueryData(queryKeys.budgetSiloamPeriod.shell(periodName), {
        budgetPeriod: freshShell.budgetPeriod,
        categories,
      });
      if (selectedCategoryId) {
        queryClient.setQueryData(
          queryKeys.budgetSiloamPeriod.category(periodName, selectedCategoryId),
          freshCat,
        );
      }

      onBudgetPeriodSaved?.(confirmed);
      showToast('Siloam budget plan saved successfully!');
      const shell = readPeriodShellCache();
      writePeriodShellCache({
        selectedPeriodName: periodName.trim(),
        periodNames: shell?.periodNames?.length ? shell.periodNames : [periodName.trim()],
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Failed to save changes.';
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [
    editedData,
    periodName,
    selectedCategoryId,
    allCategories,
    currentUser,
    onBudgetPeriodSaved,
    showToast,
    queryClient,
    updateIsDirty,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData(serverPeriodRef.current ? cloneDeep(serverPeriodRef.current) : null);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    const server = serverPeriodRef.current;
    if (!isDirty || !server || !editedData) return null;
    const changes: { item: string; before: string; after: string }[] = [];

    editedData.archetypes.forEach((editedArch) => {
      const originalArch = server.archetypes.find((a) => a.id === editedArch.id);
      if (!originalArch) return;

      allCategories.forEach((cat) => {
        const originalPlan = originalArch.budget[cat.id]?.budgetPlan || 0;
        const editedPlan = editedArch.budget[cat.id]?.budgetPlan || 0;
        if (originalPlan !== editedPlan) {
          changes.push({
            item: `${editedArch.name} - ${cat.name} Plan`,
            before: formatCurrency(originalPlan),
            after: formatCurrency(editedPlan),
          });
        }
      });
    });

    if (changes.length > 0) {
      return { title: 'Budget Plan Changes by Archetype', changes };
    }
    return null;
  }, [isDirty, editedData, allCategories]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const handleModalSave = (updatedBudgets: Record<string, number>) => {
    if (!editedData || !editingArchetypeForModal || !selectedCategoryId) return;
    const newPlanValue = updatedBudgets[selectedCategoryId];

    const newEditedData = cloneDeep(editedData);
    const arch = newEditedData.archetypes.find((a: Archetype) => a.id === editingArchetypeForModal.id);

    if (arch) {
      if (!arch.budget[selectedCategoryId]) {
        arch.budget[selectedCategoryId] = emptyBudgetItem();
      }
      arch.budget[selectedCategoryId].budgetPlan = newPlanValue;
    }

    setEditedData(recalculateBudgets(newEditedData));
    updateIsDirty(true);
  };

  const summaryTableData: BudgetSummaryRow[] = useMemo(() => {
    if (!editedData) return [];
    return allCategories.map((cat) => {
      const storedBudget = editedData.budget[cat.id] as BudgetItem | undefined;
      const calculatedAllocated = editedData.archetypes.reduce(
        (sum, arch) => sum + (arch.budget[cat.id]?.budgetPlan || 0),
        0,
      );
      const useStored = shellSummaryUsesStoredAggregates(cat.id, loadedCategoryIds);
      const live = useStored
        ? {
            budgetCarryForward: storedBudget?.budgetCarryForward ?? 0,
            approvedBudget: storedBudget?.approvedBudget ?? 0,
            consumedBudget: storedBudget?.consumedBudget ?? 0,
          }
        : editedData.archetypes.reduce(
            (acc, arch) => {
              const archLive = sumArchetypeCategoryLiveAggregates(arch, cat.id);
              acc.budgetCarryForward += archLive.budgetCarryForward;
              acc.approvedBudget += archLive.approvedBudget;
              acc.consumedBudget += archLive.consumedBudget;
              return acc;
            },
            { budgetCarryForward: 0, approvedBudget: 0, consumedBudget: 0 },
          );
      return {
        categoryId: cat.id,
        type: cat.name,
        budgetPlan: storedBudget?.budgetPlan || 0,
        budgetCarryForward: live.budgetCarryForward,
        budgetAllocated: calculatedAllocated,
        approvedBudget: live.approvedBudget,
        consumedBudget: live.consumedBudget,
      } as BudgetSummaryRow;
    });
  }, [editedData, allCategories, loadedCategoryIds]);

  const archetypeTableData: ArchetypeBudgetRow[] = useMemo(() => {
    if (!editedData || !selectedCategoryId) return [];

    const visibleArchetypes = permissions.userScopes.all
      ? editedData.archetypes
      : editedData.archetypes.filter((arch) => permissions.userScopes.archetypes.has(arch.name));

    return visibleArchetypes.map((arch) => {
      const budgetForCategory = arch.budget[selectedCategoryId];
      if (!budgetForCategory) return { ...arch };

      const calculatedAllocated = arch.units.reduce(
        (sum, hu) => sum + (hu.budget[selectedCategoryId]?.budgetPlan || 0),
        0,
      );
      const live = sumArchetypeCategoryLiveAggregates(arch, selectedCategoryId);

      return {
        ...arch,
        budgetPlanForCategory: budgetForCategory.budgetPlan,
        budgetCarryForwardForCategory: live.budgetCarryForward,
        budgetAllocatedForCategory: calculatedAllocated,
        remainingToAllocateForCategory: budgetForCategory.budgetPlan - calculatedAllocated,
        approvedBudgetForCategory: live.approvedBudget,
        consumedBudgetForCategory: live.consumedBudget,
        remainingBudgetForCategory:
          budgetForCategory.budgetPlan + live.budgetCarryForward - live.consumedBudget,
      };
    });
  }, [editedData, selectedCategoryId, permissions]);

  const columns: SpreadsheetColumn<ArchetypeBudgetRow>[] = useMemo(
    () => [
      { header: 'Network', accessor: 'name' },
      {
        header: 'Budget Plan (Pagu)',
        accessor: 'budgetPlanForCategory',
        isNumeric: true,
        isEditable: canEdit,
      },
      {
        header: 'Budget Carry Forward',
        accessor: 'budgetCarryForwardForCategory',
        isNumeric: true,
      },
      {
        header: 'Allocated vs Plan',
        accessor: (item) => {
          const plan = item.budgetPlanForCategory || 0;
          const allocated = item.budgetAllocatedForCategory || 0;
          const percent = plan > 0 ? (allocated / plan) * 100 : 0;
          const isOver = allocated > plan;
          const percentDisplay =
            percent < 1 && percent > 0 ? percent.toFixed(1) : percent.toFixed(0);

          return (
            <div className="w-full px-2 py-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-siloam-text-primary">{formatCurrency(allocated)}</span>
                <span className={isOver ? 'text-danger font-bold' : 'text-siloam-text-secondary'}>
                  {percentDisplay}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${isOver ? 'bg-danger' : 'bg-warning'}`}
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                  title={`Allocated: ${formatCurrency(allocated)} (${percentDisplay}% of ${formatCurrency(plan)})`}
                />
              </div>
            </div>
          );
        },
      },
      { header: 'Remaining to Allocate', accessor: 'remainingToAllocateForCategory', isNumeric: true },
      { header: 'FS Budget', accessor: 'approvedBudgetForCategory', isNumeric: true },
      { header: 'Realization Budget', accessor: 'consumedBudgetForCategory', isNumeric: true },
      { header: 'Remaining Budget', accessor: 'remainingBudgetForCategory', isNumeric: true },
    ],
    [canEdit],
  );

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  if (shellQuery.isError && !shellQuery.data) {
    return (
      <div className="text-center p-8 text-danger" role="alert">
        Failed to load budget data for this period.
      </div>
    );
  }

  if (isInitialLoad) {
    return <BudgetSiloamPageSkeleton />;
  }

  if (!budgetPeriod && !editedData) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">No data found for this period.</div>
    );
  }

  const displayData = editedData ?? budgetPeriod;
  if (!displayData) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">No data found for this period.</div>
    );
  }

  const activeCategories = allCategories.filter((c) => c.isActive);

  return (
    <div className="space-y-6">
      {isBackgroundRefresh && (
        <div
          className="h-0.5 w-full bg-siloam-blue/20 overflow-hidden rounded-full"
          aria-hidden
        >
          <div className="h-full w-1/3 bg-siloam-blue animate-pulse rounded-full" />
        </div>
      )}

      {saveError && (
        <p className="text-sm text-danger text-right" role="alert">
          {saveError}
        </p>
      )}

      {isDirty && canEdit && (
        <div className="flex justify-end items-center gap-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      <BudgetSummary
        data={summaryTableData}
        isCompact={isSummaryCompact}
        onToggleCompact={() => setIsSummaryCompact(!isSummaryCompact)}
      />

      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft">
        <h2 className="text-xl font-bold mb-4">Budget by Network</h2>

        <div className="hidden md:block border-b border-siloam-border overflow-x-auto mb-4">
          <nav className="-mb-px flex space-x-6" aria-label="Budget categories">
            {activeCategories.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              const isPending = pendingCategoryId === cat.id && isCategoryLoading;
              const isDimmed = selectedCategoryId != null && !isSelected;
              return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.id)}
                disabled={isCategoryLoading && isPending}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-opacity duration-200 ${
                  isSelected
                    ? 'border-siloam-blue text-siloam-blue opacity-100'
                    : isDimmed
                      ? 'border-transparent text-siloam-text-secondary opacity-40 hover:opacity-70'
                      : 'border-transparent text-siloam-text-secondary opacity-100 hover:text-siloam-text-primary hover:border-gray-300'
                }`}
              >
                {cat.name}
                {isPending ? ' …' : ''}
              </button>
            );
            })}
          </nav>
        </div>

        <div className="md:hidden mb-4">
          <Dropdown
            label="Select Budget Category"
            options={activeCategories.map((c) => c.name)}
            selectedValue={allCategories.find((c) => c.id === selectedCategoryId)?.name || ''}
            onSelect={(name) => {
              const id = allCategories.find((c) => c.name === name)?.id;
              if (id) handleCategorySelect(id);
            }}
            className="w-full"
          />
        </div>

        <div
          className={`transition-opacity duration-200 ${
            isCategoryLoading ? 'opacity-45 pointer-events-none' : 'opacity-100'
          }`}
        >
        <div className="hidden md:block">
          {selectedCategoryId ? (
            isCategoryLoading ? (
              <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-10 rounded bg-siloam-border/50" />
                ))}
              </div>
            ) : (
            <SpreadsheetTable
              key={`${periodName}-${selectedCategoryId}-${tableRevision}`}
              columns={columns}
              data={archetypeTableData}
              onDataChange={handleArchetypeDataChange}
              rowHeaderAccessor="name"
            />
            )
          ) : (
            <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-10 rounded bg-siloam-border/50" />
              ))}
            </div>
          )}
        </div>

        <div className="md:hidden space-y-4">
          {selectedCategoryId ? (
            isCategoryLoading ? (
              <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-24 rounded-xl bg-siloam-border/50" />
                ))}
              </div>
            ) : (
            archetypeTableData.map((arch) => {
              const budgetForCategory = arch.budget[selectedCategoryId];
              return (
                <BudgetSummaryCard
                  key={arch.id}
                  title={arch.name}
                  totalBudget={(budgetForCategory?.budgetPlan || 0) + (budgetForCategory?.budgetCarryForward || 0)}
                  consumedBudget={budgetForCategory?.consumedBudget || 0}
                  isEditable={canEdit}
                  onEditClick={() => {
                    setEditingArchetypeForModal(arch);
                    setIsEditModalOpen(true);
                  }}
                />
              );
            })
            )
          ) : (
            <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-24 rounded-xl bg-siloam-border/50" />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {canEdit && editingArchetypeForModal && selectedCategoryId && (
        <EditPlanModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingArchetypeForModal(null);
          }}
          onSave={handleModalSave}
          initialBudgets={{
            [selectedCategoryId]: editingArchetypeForModal.budget[selectedCategoryId]?.budgetPlan || 0,
          }}
          activeCategories={allCategories.filter((c) => c.id === selectedCategoryId)}
          title={`Edit ${editingArchetypeForModal.name} - ${allCategories.find((c) => c.id === selectedCategoryId)?.name || 'Budget'} Plan`}
        />
      )}
    </div>
  );
};

export const BudgetPeriodPage = memo(BudgetPeriodPageInner);
BudgetPeriodPage.displayName = 'BudgetPeriodPage';
