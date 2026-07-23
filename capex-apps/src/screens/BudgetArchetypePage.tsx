'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  recalculateBudgets,
  saveHuBudgetPlans,
} from '../services/budgetService';
import {
  BudgetPeriod,
  Archetype,
  User,
  UserRole,
  ChangeSummary,
  HospitalUnit,
  Page,
  BudgetSummaryRow,
} from '../types';
import { SpreadsheetTable, SpreadsheetColumn } from '../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { Dropdown } from '../components/molecules/Dropdown/Dropdown';
import { usePermissions } from '../hooks/usePermissions';
import { formatCurrency } from '../lib/formatter';
import { BudgetSummary } from '../components/organisms/BudgetSummary/BudgetSummary';
import { BudgetSummaryCard } from '../components/molecules/BudgetSummaryCard/BudgetSummaryCard';
import { EditPlanModal } from '../components/organisms/EditPlanModal/EditPlanModal';
import { queryKeys } from '../lib/query-keys';
import { fetchBudgetSiloamFullNetworkBundle } from '../hooks/queries/fetchBudgetSiloamPeriod';
import { cloneDeep } from '../lib/clone';
import { invalidateRequestCache } from '../lib/requestCache';
import { invalidateBudgetHuBackendCache } from '../services/budgetHuPageApi';
import { collectHuPlanChanges } from '../lib/budgetArchetypeHuPlanEdits';
import { BudgetArchetypePageSkeleton } from './BudgetArchetype/BudgetArchetypePageSkeleton';
import {
  buildBudgetArchetypeSummaryRows,
  computeHuAllocatedForCategory,
  emptyBudgetItem,
  sumHuCategoryLiveAggregates,
} from './BudgetArchetype/budgetArchetypeHelpers';
import * as configService from '../services/configService';
import * as fsService from '../services/fsService';
import { fetchBudgetArchetypeProjectsForExport } from '../services/fetchBudgetArchetypeProjectsForExport';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const QUERY_HYDRATE_BLOCK_MS = 3_000;

interface BudgetArchetypePageProps {
  periodName: string;
  archetypeId: string | null;
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
  onBudgetPeriodSaved?: (next: BudgetPeriod) => void;
}

interface HuBudgetRow extends HospitalUnit {
  budgetPlanForCategory?: number;
  budgetCarryForwardForCategory?: number;
  budgetAllocatedForCategory?: number;
  remainingToAllocateForCategory?: number;
  approvedBudgetForCategory?: number;
  consumedBudgetForCategory?: number;
  remainingBudgetForCategory?: number;
}

const BudgetArchetypePageInner: React.FC<BudgetArchetypePageProps> = ({
  periodName,
  archetypeId,
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
  onBudgetPeriodSaved,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.BudgetArchetype, 'view');
  const canEdit = permissions.canOperateOnPage(Page.BudgetArchetype, 'edit');

  const [editedData, setEditedData] = useState<BudgetPeriod | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSummaryCompact, setIsSummaryCompact] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingHuForModal, setEditingHuForModal] = useState<HospitalUnit | null>(null);
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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

  const periodQuery = useQuery({
    queryKey: queryKeys.budgetSiloamPeriod.detail(periodName),
    queryFn: () => fetchBudgetSiloamFullNetworkBundle(periodName, currentUser.id),
    enabled: !!periodName.trim() && canView && !!currentUser?.id,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
  });

  const budgetPeriod = periodQuery.data?.budgetPeriod ?? null;
  const allCategories = periodQuery.data?.categories ?? [];
  const isInitialLoad = periodQuery.isPending && !periodQuery.data;
  const isBackgroundRefresh = periodQuery.isFetching && !!periodQuery.data;

  useEffect(() => {
    if (Date.now() < blockQueryHydrateUntilRef.current) return;
    if (!periodQuery.data?.budgetPeriod) {
      if (!periodQuery.isPending && !serverPeriodRef.current) {
        setEditedData(null);
      }
      return;
    }
    if (isDirty) return;

    const next = recalculateBudgets(cloneDeep(periodQuery.data.budgetPeriod));
    serverPeriodRef.current = cloneDeep(next);
    setEditedData(cloneDeep(next));
    setSaveError(null);
    setSelectedCategoryId((prev) => {
      const cats = periodQuery.data!.categories;
      if (cats.length === 0) return prev;
      if (prev && cats.some((c) => c.id === prev)) return prev;
      return cats[0]?.id ?? null;
    });
    updateIsDirty(false);
  }, [periodQuery.data, periodQuery.isPending, isDirty, updateIsDirty]);

  useEffect(() => {
    setSaveError(null);
    updateIsDirty(false);
    if (!periodName.trim()) {
      setEditedData(null);
    }
  }, [periodName, updateIsDirty]);

  const selectedArchetype = useMemo(() => {
    if (!editedData || !archetypeId) return null;
    return editedData.archetypes.find((a) => a.id === archetypeId) ?? null;
  }, [editedData, archetypeId]);

  const activeCategories = useMemo(
    () => allCategories.filter((c) => c.isActive),
    [allCategories],
  );

  const archetypeSummaryTableData: BudgetSummaryRow[] = useMemo(() => {
    if (!selectedArchetype) return [];
    return buildBudgetArchetypeSummaryRows(selectedArchetype, allCategories);
  }, [selectedArchetype, allCategories]);

  const handleExportExcel = useCallback(async () => {
    if (!selectedArchetype || !periodName.trim() || isExporting) return;
    setIsExporting(true);
    try {
      const exportRows = await fetchBudgetArchetypeProjectsForExport(
        periodName,
        selectedArchetype.units.map((u) => ({ id: u.id, name: u.name })),
      );
      if (exportRows.length === 0) {
        showToast('Tidak ada project untuk diexport.', 'error');
        return;
      }

      const XLSX = await import('xlsx');
      const [priorities, studies] = await Promise.all([
        configService.getActiveProjectPriorities(),
        fsService.getAllFeasibilityStudies({ userId: currentUser.id }).catch(() => []),
      ]);
      const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name] as const));
      const priorityNameById = new Map(priorities.map((p) => [p.id, p.name] as const));
      const fsByProjectId = new Map(studies.map((s) => [s.projectId, s] as const));
      const periodLabelForExport = editedData?.periodName || periodName || '';

      const rows = exportRows.map(({ huName, project, assetCount }, index) => {
        const budgetPlan = project.budgetPlan || 0;
        const budgetCarryForward = project.budgetCarryForward || 0;
        const budgetAllocated = project.budgetAllocated || 0;
        const approvedBudget = project.approvedBudget || 0;
        const consumedBudget = project.consumedBudget || 0;
        const fs = fsByProjectId.get(project.id);

        return {
          No: index + 1,
          Archetype: selectedArchetype.name,
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

      const safeArchetype = selectedArchetype.name.replace(/[^a-z0-9-_]/gi, '_');
      const safePeriod = periodLabelForExport.replace(/[^a-z0-9-_]/gi, '_') || 'period';
      const dateTag = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `budget_archetype_projects_${safeArchetype}_${safePeriod}_${dateTag}.xlsx`);
      showToast(`Export ${rows.length} project berhasil.`, 'success');
    } catch (err) {
      console.warn('Budget Archetype export failed:', err);
      showToast(err instanceof Error ? err.message : 'Gagal export Excel.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [
    selectedArchetype,
    isExporting,
    allCategories,
    currentUser.id,
    editedData?.periodName,
    periodName,
    showToast,
  ]);

  const huTableData: HuBudgetRow[] = useMemo(() => {
    if (!selectedArchetype || !selectedCategoryId) return [];
    return selectedArchetype.units.map((hu) => {
      const budgetForCategory = hu.budget[selectedCategoryId];
      if (!budgetForCategory) return { ...hu };

      const calculatedAllocated = computeHuAllocatedForCategory(hu, selectedCategoryId);
      const plan = budgetForCategory.budgetPlan;
      const live = sumHuCategoryLiveAggregates(hu, selectedCategoryId);

      return {
        ...hu,
        budgetPlanForCategory: plan,
        budgetCarryForwardForCategory: live.budgetCarryForward,
        budgetAllocatedForCategory: calculatedAllocated,
        remainingToAllocateForCategory: plan - calculatedAllocated,
        approvedBudgetForCategory: live.approvedBudget,
        consumedBudgetForCategory: live.consumedBudget,
        remainingBudgetForCategory:
          plan + live.budgetCarryForward - live.consumedBudget,
      };
    });
  }, [selectedArchetype, selectedCategoryId]);

  const handleHuDataChange = useCallback(
    (newData: HuBudgetRow[]) => {
      if (!editedData || !selectedArchetype || !selectedCategoryId || !archetypeId) return;
      const newEditedData = cloneDeep(editedData);
      const arch = newEditedData.archetypes.find((a: Archetype) => a.id === archetypeId);

      if (arch) {
        newData.forEach((huRow) => {
          const huToUpdate = arch.units.find((u: HospitalUnit) => u.id === huRow.id);
          if (!huToUpdate) return;
          if (!huToUpdate.budget[selectedCategoryId]) {
            huToUpdate.budget[selectedCategoryId] = emptyBudgetItem();
          }
          huToUpdate.budget[selectedCategoryId].budgetPlan = huRow.budgetPlanForCategory || 0;
        });
      }
      setEditedData(recalculateBudgets(newEditedData));
      updateIsDirty(true);
    },
    [editedData, selectedArchetype, selectedCategoryId, archetypeId, updateIsDirty],
  );

  const handleSave = useCallback(async () => {
    if (!editedData || !periodName || !archetypeId || !serverPeriodRef.current) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const recalculated = recalculateBudgets(editedData);
      const categoryIds = allCategories.map((c) => c.id);
      const pendingRows = collectHuPlanChanges(
        serverPeriodRef.current,
        recalculated,
        categoryIds,
        archetypeId,
      );
      if (!pendingRows.length) {
        throw new Error('Tidak ada perubahan budget HU untuk disimpan.');
      }
      await saveHuBudgetPlans(
        recalculated,
        serverPeriodRef.current,
        archetypeId,
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

      const fresh = await fetchBudgetSiloamFullNetworkBundle(periodName, currentUser.id, {
        skipCache: true,
      });
      const confirmed = fresh.budgetPeriod
        ? recalculateBudgets(cloneDeep(fresh.budgetPeriod))
        : next;
      const categories = fresh.categories.length ? fresh.categories : allCategories;

      serverPeriodRef.current = cloneDeep(confirmed);
      setEditedData(cloneDeep(confirmed));
      setTableRevision((v) => v + 1);
      queryClient.setQueryData(queryKeys.budgetSiloamPeriod.detail(periodName), {
        budgetPeriod: confirmed,
        categories,
      });

      onBudgetPeriodSaved?.(confirmed);
      showToast('Network budget plan saved successfully!', 'success');
      onDataChange();
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
    archetypeId,
    allCategories,
    currentUser,
    onBudgetPeriodSaved,
    showToast,
    onDataChange,
    queryClient,
    updateIsDirty,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData(serverPeriodRef.current ? cloneDeep(serverPeriodRef.current) : null);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    const server = serverPeriodRef.current;
    if (!isDirty || !server || !editedData || !archetypeId) return null;
    const originalArchetype = server.archetypes.find((a) => a.id === archetypeId);
    const editedArchetype = editedData.archetypes.find((a) => a.id === archetypeId);
    if (!originalArchetype || !editedArchetype) return null;

    const changes: { item: string; before: string; after: string }[] = [];

    editedArchetype.units.forEach((editedHU) => {
      const originalHU = originalArchetype.units.find((ou) => ou.id === editedHU.id);
      if (!originalHU) return;

      allCategories.forEach((cat) => {
        const originalPlan = originalHU.budget[cat.id]?.budgetPlan || 0;
        const editedPlan = editedHU.budget[cat.id]?.budgetPlan || 0;
        if (originalPlan !== editedPlan) {
          changes.push({
            item: `${editedHU.name} - ${cat.name} - Budget Plan`,
            before: formatCurrency(originalPlan),
            after: formatCurrency(editedPlan),
          });
        }
      });
    });

    if (changes.length > 0) {
      return { title: `Budget Changes for ${selectedArchetype?.name}`, changes };
    }
    return null;
  }, [isDirty, editedData, archetypeId, allCategories, selectedArchetype?.name]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const handleModalSave = (updatedBudgets: Record<string, number>) => {
    if (!editedData || !editingHuForModal || !selectedCategoryId || !archetypeId) return;
    const newPlanValue = updatedBudgets[selectedCategoryId];

    const newEditedData = cloneDeep(editedData);
    const arch = newEditedData.archetypes.find((a: Archetype) => a.id === archetypeId);
    const hu = arch?.units.find((u: HospitalUnit) => u.id === editingHuForModal.id);

    if (hu) {
      if (!hu.budget[selectedCategoryId]) {
        hu.budget[selectedCategoryId] = emptyBudgetItem();
      }
      hu.budget[selectedCategoryId].budgetPlan = newPlanValue;
    }
    setEditedData(recalculateBudgets(newEditedData));
    updateIsDirty(true);
  };

  const columns: SpreadsheetColumn<HuBudgetRow>[] = useMemo(
    () => [
      { header: 'Hospital Unit', accessor: 'name', isEditable: false },
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
      {
        header: 'Remaining to Allocate',
        accessor: 'remainingToAllocateForCategory',
        isNumeric: true,
      },
      { header: 'FS Budget', accessor: 'approvedBudgetForCategory', isNumeric: true },
      { header: 'Realization Budget', accessor: 'consumedBudgetForCategory', isNumeric: true },
      { header: 'Remaining Budget', accessor: 'remainingBudgetForCategory', isNumeric: true },
      {
        header: 'Actions',
        accessor: (item) =>
          canEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingHuForModal(item);
                setIsEditModalOpen(true);
              }}
              className="text-siloam-blue hover:underline text-xs font-semibold"
            >
              Edit
            </button>
          ) : (
            <span className="text-xs text-siloam-text-secondary">—</span>
          ),
      },
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

  if (periodQuery.isError && !periodQuery.data) {
    return (
      <div className="text-center p-8 text-danger" role="alert">
        Failed to load budget data for the Archetype.
      </div>
    );
  }

  if (isInitialLoad) {
    return <BudgetArchetypePageSkeleton />;
  }

  if (!budgetPeriod || !editedData) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">No data found for this period.</div>
    );
  }

  if (!archetypeId) {
    return (
      <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft">
        Please select an Archetype to view details, or you may not have access to any.
      </div>
    );
  }

  if (!selectedArchetype) {
    return (
      <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft">
        Archetype not found in this period, or you may not have access to it.
      </div>
    );
  }

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
        data={archetypeSummaryTableData}
        isCompact={isSummaryCompact}
        onToggleCompact={() => setIsSummaryCompact(!isSummaryCompact)}
      />

      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-xl font-bold">{selectedArchetype.name} Budget by Hospital Unit</h2>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={isExporting}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Export semua project di network ini (data lengkap dari server)"
          >
            {isExporting ? 'Menyiapkan…' : 'Export Excel Projects'}
          </button>
        </div>

        <div className="hidden md:block border-b border-siloam-border overflow-x-auto mb-4">
          <nav className="-mb-px flex space-x-6" aria-label="Budget categories">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  selectedCategoryId === cat.id
                    ? 'border-siloam-blue text-siloam-blue'
                    : 'border-transparent text-siloam-text-secondary hover:text-siloam-text-primary hover:border-gray-300'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="md:hidden mb-4">
          <Dropdown
            label="Select Budget Category"
            options={activeCategories.map((c) => c.name)}
            selectedValue={allCategories.find((c) => c.id === selectedCategoryId)?.name || ''}
            onSelect={(name) =>
              setSelectedCategoryId(allCategories.find((c) => c.name === name)?.id || null)
            }
            className="w-full"
          />
        </div>

        <div className="hidden md:block">
          {selectedCategoryId ? (
            <SpreadsheetTable
              key={`hu-table-${selectedCategoryId}-${tableRevision}`}
              columns={columns}
              data={huTableData}
              onDataChange={handleHuDataChange}
              rowHeaderAccessor="name"
            />
          ) : (
            <div className="text-center p-8 text-siloam-text-secondary">
              Please select a budget category.
            </div>
          )}
        </div>

        <div className="md:hidden space-y-4">
          {selectedCategoryId ? (
            huTableData.length > 0 ? (
              huTableData.map((hu) => {
                const budgetForSelectedCategory = hu.budget[selectedCategoryId];
                return (
                  <BudgetSummaryCard
                    key={hu.id}
                    title={hu.name}
                    totalBudget={
                      (budgetForSelectedCategory?.budgetPlan || 0) +
                      (budgetForSelectedCategory?.budgetCarryForward || 0)
                    }
                    consumedBudget={budgetForSelectedCategory?.consumedBudget || 0}
                    isEditable={canEdit}
                    onEditClick={() => {
                      setEditingHuForModal(hu);
                      setIsEditModalOpen(true);
                    }}
                  />
                );
              })
            ) : (
              <p className="text-center text-siloam-text-secondary py-4">
                No Hospital Units for this Archetype.
              </p>
            )
          ) : (
            <p className="text-center p-8 text-siloam-text-secondary">
              Please select a budget category.
            </p>
          )}
        </div>
      </div>

      {canEdit && editingHuForModal && selectedCategoryId && (
        <EditPlanModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingHuForModal(null);
          }}
          onSave={handleModalSave}
          initialBudgets={{
            [selectedCategoryId]: editingHuForModal.budget[selectedCategoryId]?.budgetPlan || 0,
          }}
          activeCategories={allCategories.filter((c) => c.id === selectedCategoryId)}
          title={`Edit ${editingHuForModal.name} - ${allCategories.find((c) => c.id === selectedCategoryId)?.name || 'Budget'} Plan`}
        />
      )}
    </div>
  );
};

export const BudgetArchetypePage = memo(BudgetArchetypePageInner);
BudgetArchetypePage.displayName = 'BudgetArchetypePage';
