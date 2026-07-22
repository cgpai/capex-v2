import type { Archetype, Asset, BudgetItem, HospitalUnit, Project } from '../types';
import { ProjectType } from '../types';

/** Routine / General & Regular Assets project — by flag, type, or `.RA` code suffix. */
export function isRoutineAssetProject(project: Project): boolean {
  if (project.isRoutineAssetAggregator) return true;
  if (project.type === ProjectType.GeneralAndRoutine) return true;
  return /\.RA$/i.test(String(project.projectCode ?? '').trim());
}

export function findRoutineProject(hu: HospitalUnit): Project | null {
  return hu.projects.find((p) => isRoutineAssetProject(p)) ?? null;
}

/** Consumed budget for one project — live asset sum when loaded, else stored project value. */
export function sumProjectConsumedBudget(project: Project): number {
  const assets = project.assets;
  if (assets && assets.length > 0) {
    return assets.reduce((sum, asset) => sum + (Number(asset.consumedBudget) || 0), 0);
  }
  return Number(project.consumedBudget) || 0;
}

/** Allocated-to-asset budget for one project — live asset plan sum when loaded, else stored value. */
export function sumProjectBudgetAllocated(project: Project): number {
  const assets = project.assets;
  if (assets && assets.length > 0) {
    return assets.reduce((sum, asset) => sum + (Number(asset.budgetPlan) || 0), 0);
  }
  return Number(project.budgetAllocated) || 0;
}

/** Routine consumed for one category — asset-level when loaded, proportional fallback otherwise. */
export function sumRoutineCategoryConsumed(
  routine: Project | null | undefined,
  categoryId: string,
): number {
  if (!routine) return 0;
  const assets = routine.assets;
  if (assets && assets.length > 0) {
    return assets
      .filter((a) => a.budgetCategoryId === categoryId)
      .reduce((sum, a) => sum + (Number(a.consumedBudget) || 0), 0);
  }
  const totalConsumed = Number(routine.consumedBudget) || 0;
  if (totalConsumed <= 0) return 0;
  const categoryPlan = Number(routine.categoryBudgetPlan?.[categoryId]) || 0;
  const totalPlan = Object.values(routine.categoryBudgetPlan ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  if (totalPlan <= 0 || categoryPlan <= 0) return 0;
  return (categoryPlan / totalPlan) * totalConsumed;
}

/**
 * Budget distributed to projects for a HU category:
 * regular project plans + routine per-category plan.
 */
export function sumHuCategoryProjectBudgetPlan(hu: HospitalUnit, categoryId: string): number {
  const regularAllocated = hu.projects
    .filter((p) => !isRoutineAssetProject(p) && p.budgetCategoryId === categoryId)
    .reduce((sum, p) => sum + (Number(p.budgetPlan) || 0), 0);

  const routine = findRoutineProject(hu);
  const routineAllocated = Number(routine?.categoryBudgetPlan?.[categoryId]) || 0;

  return regularAllocated + routineAllocated;
}

/**
 * Live approved / consumed / carry-forward for one HU category from nested projects.
 * Falls back to stored `hu.budget` when assets are not hydrated.
 */
export function sumHuCategoryLiveAggregates(
  hu: HospitalUnit,
  categoryId: string,
): Pick<BudgetItem, 'budgetCarryForward' | 'approvedBudget' | 'consumedBudget'> {
  const regular = hu.projects.filter(
    (p) => !isRoutineAssetProject(p) && p.budgetCategoryId === categoryId,
  );
  const routine = findRoutineProject(hu);

  const budgetCarryForward = regular.reduce(
    (sum, p) => sum + (Number(p.budgetCarryForward) || 0),
    0,
  );

  const approvedBudget =
    regular.reduce((sum, p) => sum + (Number(p.approvedBudget) || 0), 0) +
    (Number(routine?.categoryBudgetPlan?.[categoryId]) || 0);

  let consumedBudget =
    regular.reduce((sum, p) => sum + sumProjectConsumedBudget(p), 0) +
    sumRoutineCategoryConsumed(routine, categoryId);

  const stored = hu.budget[categoryId];
  const hasHydratedAssets = hu.projects.some((p) => (p.assets?.length ?? 0) > 0);
  if (!hasHydratedAssets && consumedBudget === 0 && (Number(stored?.consumedBudget) || 0) > 0) {
    consumedBudget = Number(stored?.consumedBudget) || 0;
  }

  let finalApproved = approvedBudget;
  if (
    !hasHydratedAssets &&
    finalApproved === 0 &&
    (Number(stored?.approvedBudget) || 0) > 0 &&
    regular.every((p) => (Number(p.approvedBudget) || 0) === 0)
  ) {
    finalApproved = Number(stored?.approvedBudget) || 0;
  }

  return {
    budgetCarryForward,
    approvedBudget: finalApproved,
    consumedBudget,
  };
}

/** Roll up live HU aggregates to archetype level for one category. */
export function sumArchetypeCategoryLiveAggregates(
  archetype: Archetype,
  categoryId: string,
): Pick<BudgetItem, 'budgetCarryForward' | 'approvedBudget' | 'consumedBudget'> {
  return archetype.units.reduce(
    (acc, hu) => {
      const live = sumHuCategoryLiveAggregates(hu, categoryId);
      acc.budgetCarryForward += live.budgetCarryForward;
      acc.approvedBudget += live.approvedBudget;
      acc.consumedBudget += live.consumedBudget;
      return acc;
    },
    { budgetCarryForward: 0, approvedBudget: 0, consumedBudget: 0 },
  );
}

/** Whether any project in the HU has hydrated asset rows. */
export function huHasHydratedAssets(hu: HospitalUnit): boolean {
  return hu.projects.some((p) => (p.assets?.length ?? 0) > 0);
}

/** Sum asset consumed across all categories (for KPI totals). */
export function sumHuTotalConsumed(hu: HospitalUnit): number {
  if (huHasHydratedAssets(hu)) {
    return hu.projects.reduce((sum, p) => sum + sumProjectConsumedBudget(p), 0);
  }
  const fromBudget = Object.values(hu.budget ?? {}).reduce(
    (sum, item) => sum + (Number(item?.consumedBudget) || 0),
    0,
  );
  if (fromBudget > 0) return fromBudget;
  return hu.projects.reduce((sum, p) => sum + sumProjectConsumedBudget(p), 0);
}
