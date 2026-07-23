'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BudgetMultiYear,
  User,
  UserRole,
  ChangeSummary,
  BudgetPeriod,
  BudgetCategoryConfig,
} from '@/types';
import { Page } from '@/types';
import * as budgetService from '@/services/budgetService';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency, formatAbbreviatedCurrency } from '@/lib/formatter';
import { CurrencyInput } from '@/components/atoms/CurrencyInput/CurrencyInput';
import { queryKeys } from '@/lib/query-keys';
import {
  buildBudgetMultiYearPageSeedFromCache,
  fetchBudgetMultiYearPageBundle,
  fetchMultiYearPeriodBudgets,
} from '@/hooks/queries/fetchBudgetMultiYearPage';
import { fetchConfigurationSlicesForUser } from '@/hooks/queries/fetchConfigurationSlices';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { cloneDeep } from '@/lib/clone';
import { MultiSegmentProgressBar } from '@/components/molecules/MultiSegmentProgressBar/MultiSegmentProgressBar';
import { BudgetMultiYearPageSkeleton } from './BudgetMultiYearPageSkeleton';
import { PeriodDetailCard } from './PeriodDetailCard';
import { ChevronRightIcon, ChevronDownIcon } from './icons';
import {
  indexPeriodsByMultiYear,
  mergePeriodBudgets,
  periodHasCategoryBudgets,
  isPeriodBudgetPlanDirty,
  mergePeriodSummariesPreservingBudgets,
  resolveMultiYearBudgetForDisplay,
  rollupMultiYearFromPeriods,
} from './utils';

const CreateMultiYearModal = lazy(() =>
  import('@/components/organisms/CreateMultiYearModal/CreateMultiYearModal').then((m) => ({
    default: m.CreateMultiYearModal,
  })),
);
const CreatePeriodModal = lazy(() =>
  import('@/components/organisms/CreateVersionModal/CreateVersionModal').then((m) => ({
    default: m.CreatePeriodModal,
  })),
);
const EditPlanModal = lazy(() =>
  import('@/components/organisms/EditPlanModal/EditPlanModal').then((m) => ({
    default: m.EditPlanModal,
  })),
);

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;

export interface BudgetMultiYearPageProps {
  allPeriods: BudgetPeriod[];
  onDataChange: () => void;
  currentUser: User;
  allRoles: UserRole[];
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

type MultiYearRowProps = {
  my: BudgetMultiYear;
  isExpanded: boolean;
  isDimmed: boolean;
  canEdit: boolean;
  canCreate: boolean;
  periodsForRow: BudgetPeriod[];
  periodsLoading: boolean;
  categories: BudgetCategoryConfig[];
  onToggle: (name: string) => void;
  onPlanChange: (name: string, value: number) => void;
  onEditClick: (item: BudgetMultiYear) => void;
  onAddPeriod: (item: BudgetMultiYear) => void;
  onPeriodBudgetChange: (periodName: string, categoryId: string, value: number) => void;
};

const MultiYearDesktopRow = React.memo<MultiYearRowProps>(function MultiYearDesktopRow({
  my,
  isExpanded,
  isDimmed,
  canEdit,
  canCreate,
  periodsForRow,
  periodsLoading,
  categories,
  onToggle,
  onPlanChange,
  onEditClick,
  onAddPeriod,
  onPeriodBudgetChange,
}) {
  return (
    <React.Fragment>
      <tr
        className={`bg-siloam-surface border-b border-siloam-border last:border-b-0 hover:bg-siloam-bg/50 transition-colors ${
          isExpanded ? 'bg-siloam-bg/30' : ''
        } ${isDimmed ? 'opacity-45 pointer-events-none' : ''}`}
      >
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => onToggle(my.name)}
            className="p-1.5 rounded-full hover:bg-siloam-border transition-colors text-siloam-text-secondary"
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        </td>
        <td className="px-4 py-3 font-semibold text-siloam-text-primary">{my.name}</td>
        <td className="px-4 py-3 text-siloam-text-secondary">
          {my.startYear} - {my.endYear}
        </td>
        <td className="px-4 py-3 text-right p-0">
          {canEdit ? (
            <CurrencyInput
              value={my.budget.budgetPlan}
              onValueChange={(val) => onPlanChange(my.name, val)}
              className="w-full h-full px-4 py-3 text-right bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-siloam-blue/50 border border-transparent focus:border-siloam-blue rounded transition-all font-medium"
            />
          ) : (
            <span className="px-4 py-3 block font-medium">{formatCurrency(my.budget.budgetPlan)}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-medium text-siloam-text-primary">
          {formatCurrency(my.budget.budgetCarryForward)}
        </td>
        <td className="px-4 py-3">
          <div className="w-full">
            <MultiSegmentProgressBar
              total={my.budget.budgetPlan + my.budget.budgetCarryForward}
              allocated={my.budget.budgetAllocated}
              approved={my.budget.approvedBudget}
              consumed={my.budget.consumedBudget}
              className="mb-2 h-2"
            />
            <div className="grid grid-cols-3 gap-1 text-[10px] leading-tight">
              <div>
                <div className="text-siloam-text-secondary mb-0.5">Allocated</div>
                <div className="font-bold text-siloam-text-primary">{formatAbbreviatedCurrency(my.budget.budgetAllocated)}</div>
              </div>
              <div>
                <div className="text-siloam-text-secondary mb-0.5">FS Budget</div>
                <div className="font-bold text-siloam-text-primary">{formatAbbreviatedCurrency(my.budget.approvedBudget)}</div>
              </div>
              <div>
                <div className="text-siloam-text-secondary mb-0.5">Realization Budget</div>
                <div className="font-bold text-siloam-text-primary">{formatAbbreviatedCurrency(my.budget.consumedBudget)}</div>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right font-medium text-siloam-green">
          {formatCurrency(my.budget.budgetPlan + my.budget.budgetCarryForward - my.budget.consumedBudget)}
        </td>
        <td className="px-4 py-3 text-center space-x-3">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEditClick(my)}
              className="text-siloam-blue hover:text-siloam-blue/80 font-semibold text-xs uppercase tracking-wide"
            >
              Edit
            </button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-siloam-bg/30 border-b border-siloam-border">
          <td colSpan={8} className="p-0">
            <div className="p-6 pl-16 shadow-inner bg-gray-50/50">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-siloam-text-primary text-sm uppercase tracking-wide flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-siloam-blue" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                  Budget Periods Breakdown
                </h4>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => onAddPeriod(my)}
                    className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg hover:bg-siloam-blue/90 transition text-xs font-medium shadow-sm"
                  >
                    + New Period
                  </button>
                )}
              </div>
              {periodsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-24 bg-siloam-border/50 rounded-xl" />
                  <div className="h-24 bg-siloam-border/40 rounded-xl" />
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {periodsForRow.map((period) => (
                    <PeriodDetailCard
                      key={period.periodName}
                      period={period}
                      categories={categories}
                      isEditable={canEdit}
                      onPeriodBudgetChange={onPeriodBudgetChange}
                    />
                  ))}
                  {periodsForRow.length === 0 && (
                    <div className="text-center py-8 text-siloam-text-secondary bg-white rounded-xl border border-dashed border-siloam-border">
                      No budget periods defined for this plan.
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
});

const MultiYearMobileCard = React.memo<MultiYearRowProps>(function MultiYearMobileCard({
  my,
  isExpanded,
  isDimmed,
  canEdit,
  canCreate,
  periodsForRow,
  periodsLoading,
  categories,
  onToggle,
  onPlanChange,
  onEditClick,
  onAddPeriod,
  onPeriodBudgetChange,
}) {
  return (
    <div className={`bg-siloam-surface p-4 rounded-xl border border-siloam-border shadow-sm space-y-4 ${isDimmed ? 'opacity-45 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-siloam-text-primary text-lg">{my.name}</h4>
          <p className="text-xs text-siloam-text-secondary">
            {my.startYear} - {my.endYear}
          </p>
        </div>
        <button type="button" onClick={() => onToggle(my.name)} className="p-1 text-siloam-text-secondary">
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-siloam-text-secondary mb-1 font-semibold">BUDGET PLAN (PAGU)</p>
          {canEdit ? (
            <CurrencyInput
              value={my.budget.budgetPlan}
              onValueChange={(val) => onPlanChange(my.name, val)}
              className="w-full px-3 py-2 border border-siloam-border rounded-lg focus:ring-2 focus:ring-siloam-blue focus:outline-none font-bold text-siloam-text-primary bg-white dark:bg-siloam-surface"
            />
          ) : (
            <p className="text-xl font-bold text-siloam-text-primary">{formatCurrency(my.budget.budgetPlan)}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-siloam-text-secondary mb-1 font-semibold">BUDGET CARRY FORWARD</p>
          <p className="text-xl font-bold text-siloam-text-primary">{formatCurrency(my.budget.budgetCarryForward)}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-siloam-text-secondary mb-2 font-semibold">USAGE OVERVIEW</p>
        <MultiSegmentProgressBar
          total={my.budget.budgetPlan + my.budget.budgetCarryForward}
          allocated={my.budget.budgetAllocated}
          approved={my.budget.approvedBudget}
          consumed={my.budget.consumedBudget}
          className="mb-3 h-3"
        />
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 bg-warning rounded-full" />
              <span className="text-siloam-text-secondary">Allocated</span>
            </div>
            <div className="font-semibold pl-3.5">{formatAbbreviatedCurrency(my.budget.budgetAllocated)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 bg-siloam-green rounded-full" />
              <span className="text-siloam-text-secondary">FS Budget</span>
            </div>
            <div className="font-semibold pl-3.5">{formatAbbreviatedCurrency(my.budget.approvedBudget)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 bg-siloam-blue rounded-full" />
              <span className="text-siloam-text-secondary">Realization Budget</span>
            </div>
            <div className="font-semibold pl-3.5">{formatAbbreviatedCurrency(my.budget.consumedBudget)}</div>
          </div>
          <div>
            <div className="text-siloam-text-secondary mb-0.5">Remaining</div>
            <div className="font-bold text-siloam-green pl-3.5">
              {formatAbbreviatedCurrency(my.budget.budgetPlan + my.budget.budgetCarryForward - my.budget.consumedBudget)}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-siloam-border flex justify-end gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditClick(my)}
            className="px-3 py-1.5 text-xs font-semibold text-siloam-blue border border-siloam-blue rounded-lg hover:bg-siloam-blue/5"
          >
            Edit Plan
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggle(my.name)}
          className="px-3 py-1.5 text-xs font-semibold text-siloam-text-secondary hover:bg-siloam-bg rounded-lg transition-colors"
        >
          {isExpanded ? 'Hide Periods' : 'View Periods'}
        </button>
      </div>

      {isExpanded && (
        <div className="bg-gray-50 rounded-lg p-3 mt-2 border border-siloam-border space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-siloam-text-secondary uppercase">Periods Breakdown</span>
            {canCreate && (
              <button
                type="button"
                onClick={() => onAddPeriod(my)}
                className="text-xs bg-siloam-blue text-white px-2 py-1 rounded hover:bg-siloam-blue/90"
              >
                + Add
              </button>
            )}
          </div>
          {periodsLoading ? (
            <div className="h-20 animate-pulse bg-siloam-border/40 rounded-lg" />
          ) : (
            <div className="space-y-4">
              {periodsForRow.map((period) => (
                <PeriodDetailCard
                  key={period.periodName}
                  period={period}
                  categories={categories}
                  isEditable={canEdit}
                  onPeriodBudgetChange={onPeriodBudgetChange}
                />
              ))}
              {periodsForRow.length === 0 && (
                <p className="text-xs text-center text-siloam-text-secondary italic py-2">No periods yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const BudgetMultiYearPage = memo(function BudgetMultiYearPage({
  allPeriods,
  onDataChange,
  currentUser,
  allRoles,
  setIsPageDirty,
  setPageActions,
  showToast,
}: BudgetMultiYearPageProps) {
  const queryClient = useQueryClient();
  const bootstrapSeed = queryClient.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
  const bootstrapUpdatedAt = queryClient.getQueryState([...queryKeys.app.bootstrap])?.dataUpdatedAt;
  const initialPageBundle = useMemo(
    () => buildBudgetMultiYearPageSeedFromCache(queryClient, currentUser.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed sekali saat mount
    [],
  );
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.BudgetMultiYear, 'view');
  const canEdit = permissions.canOperateOnPage(Page.BudgetMultiYear, 'edit');
  const canCreate = permissions.canOperateOnPage(Page.BudgetMultiYear, 'create');

  const [editedData, setEditedData] = useState<BudgetMultiYear[]>(() =>
    bootstrapSeed?.multiYears?.length ? cloneDeep(bootstrapSeed.multiYears) : [],
  );
  const [editedPeriods, setEditedPeriods] = useState<BudgetPeriod[]>(() =>
    allPeriods.length ? cloneDeep(allPeriods) : [],
  );
  const [allCategories, setAllCategories] = useState<BudgetCategoryConfig[]>(
    () => initialPageBundle.categories.filter((c) => c.isActive),
  );
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreatePeriodModalOpen, setIsCreatePeriodModalOpen] = useState(false);
  const [editingMultiYear, setEditingMultiYear] = useState<BudgetMultiYear | null>(null);
  const [selectedMultiYearForPeriod, setSelectedMultiYearForPeriod] = useState<BudgetMultiYear | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [loadingPeriodBudgetsFor, setLoadingPeriodBudgetsFor] = useState<string | null>(null);

  const serverMultiYearsRef = useRef<BudgetMultiYear[]>(
    bootstrapSeed?.multiYears?.length ? cloneDeep(bootstrapSeed.multiYears) : [],
  );
  const serverPeriodsRef = useRef<BudgetPeriod[]>(allPeriods.length ? cloneDeep(allPeriods) : []);

  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const hasInstantSeed = initialPageBundle.multiYears.length > 0;

  const pageQuery = useQuery({
    queryKey: queryKeys.budgetMultiYear.page(currentUser.id),
    queryFn: () => fetchBudgetMultiYearPageBundle(queryClient),
    enabled: canView && Number.isFinite(currentUser.id),
    initialData: hasInstantSeed ? initialPageBundle : undefined,
    initialDataUpdatedAt: hasInstantSeed ? bootstrapUpdatedAt : undefined,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: hasInstantSeed ? false : true,
    placeholderData: (prev) => prev ?? (hasInstantSeed ? initialPageBundle : undefined),
  });

  const serverMultiYears = pageQuery.data?.multiYears ?? serverMultiYearsRef.current;

  useEffect(() => {
    if (allCategories.length || !Number.isFinite(currentUser.id)) return;
    let cancelled = false;
    void fetchConfigurationSlicesForUser(currentUser.id, ['budgetCategories']).then((slice) => {
      if (cancelled) return;
      const cats = slice.budgetCategories?.filter((c) => c.isActive) ?? [];
      if (cats.length) setAllCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, [allCategories.length, currentUser.id]);

  useEffect(() => {
    if (!pageQuery.data || isDirty) return;
    if (!pageQuery.data.multiYears.length && editedData.length > 0) return;
    serverMultiYearsRef.current = pageQuery.data.multiYears;
    setEditedData(cloneDeep(pageQuery.data.multiYears));
    if (pageQuery.data.categories.length) {
      setAllCategories(pageQuery.data.categories.filter((c) => c.isActive));
    }
    updateIsDirty(false);
  }, [pageQuery.data, isDirty, editedData.length, updateIsDirty]);

  useEffect(() => {
    if (!allPeriods.length || isDirty) return;
    const hasAnyBudget = allPeriods.some(periodHasCategoryBudgets);
    if (hasAnyBudget) {
      serverPeriodsRef.current = allPeriods;
      setEditedPeriods(cloneDeep(allPeriods));
      return;
    }
    setEditedPeriods((prev) => mergePeriodSummariesPreservingBudgets(allPeriods, prev));
  }, [allPeriods, isDirty]);

  const periodsByMultiYear = useMemo(() => indexPeriodsByMultiYear(editedPeriods), [editedPeriods]);
  const categoryIds = useMemo(
    () => allCategories.filter((c) => c.isActive).map((c) => c.id),
    [allCategories],
  );
  const activeCategories = useMemo(
    () => allCategories.filter((c) => c.isActive),
    [allCategories],
  );
  const displayMultiYears = useMemo(
    () =>
      editedData.map((my) =>
        resolveMultiYearBudgetForDisplay(my, periodsByMultiYear.get(my.name) ?? [], categoryIds),
      ),
    [editedData, periodsByMultiYear, categoryIds],
  );

  const ensurePeriodBudgetsLoaded = useCallback(
    async (multiYearName: string) => {
      const rowPeriods = periodsByMultiYear.get(multiYearName) ?? [];
      if (rowPeriods.length > 0 && rowPeriods.every(periodHasCategoryBudgets)) return;

      setLoadingPeriodBudgetsFor(multiYearName);
      try {
        const loadedBundle = await queryClient.fetchQuery({
          queryKey: queryKeys.budgetMultiYear.periodBudgets(multiYearName),
          queryFn: () => fetchMultiYearPeriodBudgets(multiYearName, currentUser.id),
          staleTime: STALE_MS,
        });
        const loaded = loadedBundle.periods;
        if (loadedBundle.categories.length) {
          setAllCategories((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            for (const cat of loadedBundle.categories) {
              if (cat.id && cat.isActive !== false) byId.set(cat.id, cat);
            }
            return [...byId.values()];
          });
        }
        setEditedPeriods((prev) => {
          const forMy = prev.filter((p) => p.multiYearName === multiYearName);
          const rest = prev.filter((p) => p.multiYearName !== multiYearName);
          const merged = mergePeriodBudgets(forMy.length ? forMy : loaded, loaded);
          const mergedNames = new Set(merged.map((p) => p.periodName));
          const extras = loaded.filter((p) => !mergedNames.has(p.periodName));
          const next = [...rest, ...merged, ...extras];
          if (!isDirty) {
            serverPeriodsRef.current = cloneDeep(next);
          }
          return next;
        });
      } catch (e) {
        console.error('Failed to load period budgets:', e);
        showToast('Failed to load period details.', 'error');
      } finally {
        setLoadingPeriodBudgetsFor((cur) => (cur === multiYearName ? null : cur));
      }
    },
    [periodsByMultiYear, queryClient, showToast, isDirty, currentUser.id],
  );

  const toggleRow = useCallback(
    (planName: string) => {
      setExpandedRows((prev) => {
        const next = new Set(prev);
        if (next.has(planName)) {
          next.delete(planName);
        } else {
          next.add(planName);
          void ensurePeriodBudgetsLoaded(planName);
        }
        return next;
      });
    },
    [ensurePeriodBudgetsLoaded],
  );

  const patchPageCache = useCallback(
    (nextMultiYears: BudgetMultiYear[]) => {
      queryClient.setQueryData(queryKeys.budgetMultiYear.page(currentUser.id), (old: typeof pageQuery.data) => ({
        multiYears: nextMultiYears,
        categories: old?.categories ?? allCategories,
      }));
    },
    [queryClient, currentUser.id, allCategories],
  );

  const handleCreateMultiYear = useCallback(
    async (name: string, startYear: number, endYear: number) => {
      const trimmed = name.trim();
      if (!trimmed) return { success: false, message: 'Name is required.' };
      const result = await budgetService.createMultiYear(trimmed, startYear, endYear);
      if (result.success) {
        showToast(result.message, 'success');
        setIsCreateModalOpen(false);
        const emptyBudget = {
          budgetPlan: 0,
          budgetCarryForward: 0,
          budgetAllocated: 0,
          approvedBudget: 0,
          consumedBudget: 0,
        };
        const optimistic: BudgetMultiYear = { name: trimmed, startYear, endYear, budget: emptyBudget };
        const next = [...editedData, optimistic];
        setEditedData(next);
        serverMultiYearsRef.current = next;
        patchPageCache(next);
        onDataChange();
        void pageQuery.refetch();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    },
    [editedData, showToast, onDataChange, pageQuery, patchPageCache],
  );

  const handleCreatePeriod = useCallback(
    async (periodName: string, startDate: string, endDate: string) => {
      if (!selectedMultiYearForPeriod) return { success: false, message: 'No parent plan selected.' };
      const result = await budgetService.createBudgetPeriod(
        periodName.trim(),
        startDate,
        endDate,
        selectedMultiYearForPeriod.name,
      );
      if (result.success) {
        showToast(result.message, 'success');
        setIsCreatePeriodModalOpen(false);
        const optimistic: BudgetPeriod = {
          periodName: periodName.trim(),
          multiYearName: selectedMultiYearForPeriod.name,
          startDate,
          endDate,
          budget: {},
          archetypes: [],
        };
        setEditedPeriods((prev) => [...prev, optimistic]);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.budgetMultiYear.periodBudgets(selectedMultiYearForPeriod.name),
        });
        onDataChange();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    },
    [selectedMultiYearForPeriod, showToast, onDataChange, queryClient],
  );

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const originalMyMap = new Map(serverMultiYearsRef.current.map((my) => [my.name, my]));
      const changedMultiYears = editedData.filter((my) => {
        const orig = originalMyMap.get(my.name);
        return orig && orig.budget.budgetPlan !== my.budget.budgetPlan;
      });

      await Promise.all(changedMultiYears.map((my) => budgetService.saveMultiYear(my, currentUser.id)));

      const originalPeriodsMap = new Map(serverPeriodsRef.current.map((p) => [p.periodName, p]));
      const modifiedPeriods = editedPeriods.filter((ep) => {
        const original = originalPeriodsMap.get(ep.periodName);
        if (!original) return false;
        return isPeriodBudgetPlanDirty(original, ep, categoryIds);
      });

      if (modifiedPeriods.length > 0) {
        await Promise.all(
          modifiedPeriods.map((p) => budgetService.savePeriodCategoryPlans(p, currentUser.id, categoryIds)),
        );
      }

      const nextPeriods = cloneDeep(editedPeriods);
      const nextMultiYears = editedData.map((my) =>
        rollupMultiYearFromPeriods(
          my,
          nextPeriods.filter((p) => p.multiYearName === my.name),
          categoryIds,
        ),
      );

      serverMultiYearsRef.current = cloneDeep(nextMultiYears);
      serverPeriodsRef.current = cloneDeep(nextPeriods);
      setEditedData(nextMultiYears);
      setEditedPeriods(nextPeriods);
      patchPageCache(nextMultiYears);
      updateIsDirty(false);
      showToast('Budget plans saved successfully!', 'success');
      onDataChange();
      void pageQuery.refetch();
    } catch (error) {
      console.error(error);
      showToast('Failed to save changes.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    editedData,
    editedPeriods,
    categoryIds,
    currentUser,
    showToast,
    onDataChange,
    pageQuery,
    patchPageCache,
    updateIsDirty,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData(cloneDeep(serverMultiYearsRef.current));
    setEditedPeriods(cloneDeep(serverPeriodsRef.current.length ? serverPeriodsRef.current : allPeriods));
    updateIsDirty(false);
  }, [allPeriods, updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;

    const changes: { item: string; before: string; after: string }[] = [];
    const originalMyMap = new Map(serverMultiYearsRef.current.map((my) => [my.name, my]));

    editedData.forEach((editedMY) => {
      const originalMY = originalMyMap.get(editedMY.name);
      if (originalMY && originalMY.budget.budgetPlan !== editedMY.budget.budgetPlan) {
        changes.push({
          item: `${editedMY.name} - Budget Plan`,
          before: formatCurrency(originalMY.budget.budgetPlan),
          after: formatCurrency(editedMY.budget.budgetPlan),
        });
      }
    });

    const originalPeriodsMap = new Map(serverPeriodsRef.current.map((p) => [p.periodName, p]));
    editedPeriods.forEach((editedPeriod) => {
      const original = originalPeriodsMap.get(editedPeriod.periodName);
      if (!original) return;
      allCategories.forEach((cat) => {
        const oldVal = original.budget[cat.id]?.budgetPlan ?? 0;
        const newVal = editedPeriod.budget[cat.id]?.budgetPlan ?? 0;
        if (oldVal !== newVal) {
          changes.push({
            item: `${editedPeriod.periodName} - ${cat.name}`,
            before: formatCurrency(oldVal),
            after: formatCurrency(newVal),
          });
        }
      });
    });

    if (changes.length === 0) return null;
    return { title: 'Budget Plan Changes', changes };
  }, [isDirty, editedData, editedPeriods, allCategories]);

  const handleSaveRef = useRef(handleSave);
  const handleCancelRef = useRef(handleCancel);
  const getChangeSummaryRef = useRef(getChangeSummary);
  handleSaveRef.current = handleSave;
  handleCancelRef.current = handleCancel;
  getChangeSummaryRef.current = getChangeSummary;

  useEffect(() => {
    setPageActions({
      onSave: () => handleSaveRef.current(),
      onCancel: () => handleCancelRef.current(),
      getSummary: () => getChangeSummaryRef.current(),
    });
  }, [setPageActions]);

  const handleEditClick = useCallback((item: BudgetMultiYear) => {
    setEditingMultiYear(item);
    setIsEditModalOpen(true);
  }, []);

  const handleBudgetPlanChange = useCallback(
    (planName: string, newValue: number) => {
      setEditedData((prev) =>
        prev.map((item) =>
          item.name === planName ? { ...item, budget: { ...item.budget, budgetPlan: newValue } } : item,
        ),
      );
      updateIsDirty(true);
    },
    [updateIsDirty],
  );

  const handlePeriodBudgetChange = useCallback(
    (periodName: string, categoryId: string, newValue: number) => {
      setEditedPeriods((prev) =>
        prev.map((p) => {
          if (p.periodName !== periodName) return p;
          const updatedBudget = { ...p.budget };
          const existing = updatedBudget[categoryId] ?? {
            budgetPlan: 0,
            budgetCarryForward: 0,
            budgetAllocated: 0,
            approvedBudget: 0,
            consumedBudget: 0,
          };
          updatedBudget[categoryId] = { ...existing, budgetPlan: newValue };
          return { ...p, budget: updatedBudget };
        }),
      );
      updateIsDirty(true);
    },
    [updateIsDirty],
  );

  const handleModalSave = useCallback(
    (updatedBudgets: Record<string, number>) => {
      if (!editingMultiYear) return;
      const newPlanValue = updatedBudgets.budgetPlan;
      setEditedData((prev) =>
        prev.map((my) =>
          my.name === editingMultiYear.name
            ? { ...my, budget: { ...my.budget, budgetPlan: newPlanValue } }
            : my,
        ),
      );
      updateIsDirty(true);
      setIsEditModalOpen(false);
    },
    [editingMultiYear, updateIsDirty],
  );

  const openCreatePeriodModal = useCallback((my: BudgetMultiYear) => {
    setSelectedMultiYearForPeriod(my);
    setIsCreatePeriodModalOpen(true);
  }, []);

  const showShell =
    pageQuery.isPending && !pageQuery.data && editedData.length === 0 && !hasInstantSeed;
  const showLoadError = pageQuery.isError && editedData.length === 0;

  const existingPeriodsForModal = useMemo(
    () =>
      selectedMultiYearForPeriod
        ? allPeriods.filter((p) => p.multiYearName === selectedMultiYearForPeriod.name)
        : [],
    [allPeriods, selectedMultiYearForPeriod],
  );

  if (!canView) {
    return <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center gap-4">
        {isDirty && canEdit && (
          <div className="flex items-center space-x-2">
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
      </div>

      {showLoadError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center text-danger">
          Gagal memuat data budget multi-year. Periksa koneksi backend dan coba muat ulang halaman.
        </div>
      ) : showShell ? (
        <BudgetMultiYearPageSkeleton />
      ) : (
        <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-bold text-siloam-text-primary">Budget Usage Legend:</span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-warning rounded-sm" />
                Allocated
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-siloam-green rounded-sm" />
                FS Budget
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-siloam-blue rounded-sm" />
                Realization Budget
              </div>
              <div className="text-gray-300 text-lg font-light">|</div>
              <div className="flex items-center gap-1.5">
                <span className="w-0.5 h-3 bg-purple-500" />
                Total Budget Plan
              </div>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft font-medium text-sm"
              >
                + New Multi-Year Plan
              </button>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto border border-siloam-border rounded-xl shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="text-xs text-siloam-text-secondary bg-siloam-sidebar border-b border-siloam-border">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3 font-bold">MULTI-YEAR PLAN</th>
                  <th className="px-4 py-3 font-bold">PERIOD</th>
                  <th className="px-4 py-3 font-bold text-right w-40">BUDGET PLAN</th>
                  <th className="px-4 py-3 font-bold text-right w-40">BUDGET CARRY FORWARD</th>
                  <th className="px-4 py-3 font-bold w-72">BUDGET USAGE</th>
                  <th className="px-4 py-3 font-bold text-right">REMAINING BUDGET</th>
                  <th className="px-4 py-3 font-bold text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {displayMultiYears.map((my) => (
                  <MultiYearDesktopRow
                    key={my.name}
                    my={my}
                    isExpanded={expandedRows.has(my.name)}
                    isDimmed={loadingPeriodBudgetsFor != null && loadingPeriodBudgetsFor !== my.name}
                    canEdit={canEdit}
                    canCreate={canCreate}
                    periodsForRow={periodsByMultiYear.get(my.name) ?? []}
                    periodsLoading={loadingPeriodBudgetsFor === my.name}
                    categories={activeCategories}
                    onToggle={toggleRow}
                    onPlanChange={handleBudgetPlanChange}
                    onEditClick={handleEditClick}
                    onAddPeriod={openCreatePeriodModal}
                    onPeriodBudgetChange={handlePeriodBudgetChange}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {displayMultiYears.map((my) => (
              <MultiYearMobileCard
                key={my.name}
                my={my}
                isExpanded={expandedRows.has(my.name)}
                isDimmed={loadingPeriodBudgetsFor != null && loadingPeriodBudgetsFor !== my.name}
                canEdit={canEdit}
                canCreate={canCreate}
                periodsForRow={periodsByMultiYear.get(my.name) ?? []}
                periodsLoading={loadingPeriodBudgetsFor === my.name}
                categories={activeCategories}
                onToggle={toggleRow}
                onPlanChange={handleBudgetPlanChange}
                onEditClick={handleEditClick}
                onAddPeriod={openCreatePeriodModal}
                onPeriodBudgetChange={handlePeriodBudgetChange}
              />
            ))}
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {isCreateModalOpen && (
          <CreateMultiYearModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreate={handleCreateMultiYear}
            existingMultiYears={serverMultiYears}
          />
        )}
        {isCreatePeriodModalOpen && selectedMultiYearForPeriod && (
          <CreatePeriodModal
            isOpen={isCreatePeriodModalOpen}
            onClose={() => setIsCreatePeriodModalOpen(false)}
            onCreate={handleCreatePeriod}
            existingPeriods={existingPeriodsForModal}
            parentMultiYear={selectedMultiYearForPeriod}
          />
        )}
        {canEdit && isEditModalOpen && editingMultiYear && (
          <EditPlanModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleModalSave}
            initialBudgets={{ budgetPlan: editingMultiYear.budget.budgetPlan }}
            activeCategories={[{ id: 'budgetPlan', name: 'Budget Plan (Pagu)', isActive: true }]}
            title={`Edit Plan for ${editingMultiYear.name}`}
          />
        )}
      </Suspense>
    </div>
  );
});

BudgetMultiYearPage.displayName = 'BudgetMultiYearPage';
