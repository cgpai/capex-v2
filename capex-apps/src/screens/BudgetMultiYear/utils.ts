import type { BudgetCategoryConfig, BudgetItem, BudgetMultiYear, BudgetPeriod } from '@/types';

/** Hanya kategori aktif (isActive) — kategori hidden/inactive tidak ditampilkan. */
export function resolveDisplayCategories(categories: BudgetCategoryConfig[]): BudgetCategoryConfig[] {
  return categories
    .filter((c) => c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function budgetItemHasVisibleValues(item: BudgetItem): boolean {
  return (
    (item.budgetPlan ?? 0) !== 0 ||
    (item.budgetCarryForward ?? 0) !== 0 ||
    (item.budgetAllocated ?? 0) !== 0 ||
    (item.approvedBudget ?? 0) !== 0 ||
    (item.consumedBudget ?? 0) !== 0
  );
}

export function indexPeriodsByMultiYear(periods: BudgetPeriod[]): Map<string, BudgetPeriod[]> {
  const map = new Map<string, BudgetPeriod[]>();
  for (const p of periods) {
    const key = p.multiYearName;
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return map;
}

export function periodHasCategoryBudgets(period: BudgetPeriod): boolean {
  return Object.keys(period.budget ?? {}).length > 0;
}

export function mergePeriodBudgets(
  base: BudgetPeriod[],
  loaded: BudgetPeriod[],
): BudgetPeriod[] {
  if (!loaded.length) return base;
  const loadedMap = new Map(loaded.map((p) => [p.periodName, p]));
  return base.map((p) => {
    const detail = loadedMap.get(p.periodName);
    if (!detail) return p;
    return { ...p, budget: { ...detail.budget } };
  });
}

export function computePeriodTotals(
  budget: Record<string, BudgetItem>,
  activeCategoryIds?: string[],
) {
  const activeIds = activeCategoryIds?.length ? new Set(activeCategoryIds) : null;
  const items = activeIds
    ? (activeCategoryIds!.map((id) => budget[id]).filter(Boolean) as BudgetItem[])
    : (Object.values(budget) as BudgetItem[]);

  return items.reduce(
    (acc, item) => ({
      plan: acc.plan + (item.budgetPlan ?? 0),
      carryForward: acc.carryForward + (item.budgetCarryForward ?? 0),
      allocated: acc.allocated + (item.budgetAllocated ?? 0),
      approved: acc.approved + (item.approvedBudget ?? 0),
      consumed: acc.consumed + (item.consumedBudget ?? 0),
    }),
    { plan: 0, carryForward: 0, allocated: 0, approved: 0, consumed: 0 },
  );
}

export function isPeriodBudgetPlanDirty(original: BudgetPeriod, edited: BudgetPeriod, categoryIds: string[]): boolean {
  for (const catId of categoryIds) {
    const oldVal = original.budget[catId]?.budgetPlan ?? 0;
    const newVal = edited.budget[catId]?.budgetPlan ?? 0;
    if (oldVal !== newVal) return true;
  }
  return false;
}

/** Hitung ulang agregat multi-year dari budget periode (sama seperti bootstrap BE). */
export function rollupMultiYearFromPeriods(
  my: BudgetMultiYear,
  periods: BudgetPeriod[],
  activeCategoryIds?: string[],
): BudgetMultiYear {
  let totalAllocated = 0;
  let totalApproved = 0;
  let totalConsumed = 0;
  let totalCarryForward = 0;

  for (const period of periods) {
    const totals = computePeriodTotals(period.budget, activeCategoryIds);
    totalAllocated += totals.allocated;
    totalApproved += totals.approved;
    totalConsumed += totals.consumed;
    totalCarryForward += totals.carryForward;
  }

  return {
    ...my,
    budget: {
      ...my.budget,
      budgetCarryForward: totalCarryForward,
      budgetAllocated: totalAllocated,
      approvedBudget: totalApproved,
      consumedBudget: totalConsumed,
    },
  };
}

/** Tampilkan agregat dari periode bila sudah di-load; fallback ke snapshot server. */
export function resolveMultiYearBudgetForDisplay(
  my: BudgetMultiYear,
  periods: BudgetPeriod[],
  activeCategoryIds?: string[],
): BudgetMultiYear {
  if (!periods.some(periodHasCategoryBudgets)) return my;
  return rollupMultiYearFromPeriods(my, periods, activeCategoryIds);
}

/** Ringkasan periode dari shell — jangan timpa budget kategori yang sudah di-load. */
export function mergePeriodSummariesPreservingBudgets(
  summaries: BudgetPeriod[],
  existing: BudgetPeriod[],
): BudgetPeriod[] {
  const existingByName = new Map(existing.map((p) => [p.periodName, p]));
  return summaries.map((summary) => {
    const prev = existingByName.get(summary.periodName);
    if (!prev || !periodHasCategoryBudgets(prev)) return summary;
    return {
      ...summary,
      budget: prev.budget,
      archetypes: prev.archetypes ?? [],
    };
  });
}
