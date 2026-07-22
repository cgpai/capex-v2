import type { Archetype, BudgetCategoryConfig, BudgetItem, BudgetSummaryRow, HospitalUnit } from '@/types';
import {
  sumArchetypeCategoryLiveAggregates,
  sumHuCategoryLiveAggregates,
  sumHuCategoryProjectBudgetPlan,
} from '@/lib/budgetCategoryAggregates';

export function emptyBudgetItem(): BudgetItem {
  return {
    budgetPlan: 0,
    budgetCarryForward: 0,
    budgetAllocated: 0,
    approvedBudget: 0,
    consumedBudget: 0,
  };
}

/** @deprecated Use `sumHuCategoryProjectBudgetPlan` from `budgetCategoryAggregates`. */
export function computeHuAllocatedForCategory(hu: HospitalUnit, categoryId: string): number {
  return sumHuCategoryProjectBudgetPlan(hu, categoryId);
}

export function buildBudgetArchetypeSummaryRows(
  archetype: Archetype,
  categories: BudgetCategoryConfig[],
): BudgetSummaryRow[] {
  return categories.map((cat) => {
    const categoryId = cat.id;
    const archBudget = archetype.budget[categoryId];
    const allocatedToUnits = archetype.units.reduce(
      (sum, hu) => sum + (hu.budget[categoryId]?.budgetPlan || 0),
      0,
    );
    const live = sumArchetypeCategoryLiveAggregates(archetype, categoryId);

    return {
      categoryId,
      type: cat.name,
      budgetPlan: archBudget?.budgetPlan || 0,
      budgetCarryForward: live.budgetCarryForward,
      budgetAllocated: allocatedToUnits,
      approvedBudget: live.approvedBudget,
      consumedBudget: live.consumedBudget,
    };
  });
}

export { sumHuCategoryLiveAggregates, sumHuCategoryProjectBudgetPlan };
