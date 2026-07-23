import type { Archetype, BudgetCategoryConfig, BudgetPeriod, HospitalUnit } from '@/types';
import { recalculateBudgets } from '@/services/budgetService';
import { cloneDeep } from '@/lib/clone';

export const DEFAULT_BUDGET_CATEGORY_ID = 'cat-rev-main';
export const DEFAULT_BUDGET_CATEGORY_NAME = 'Revenue Maintenance';

/** Kategori default saat mount Budget Period — Revenue Maintenance, fallback kategori aktif pertama. */
export function resolveDefaultBudgetCategoryId(
  categories: BudgetCategoryConfig[],
): string | null {
  const active = categories.filter((c) => c.isActive);
  if (!active.length) return null;
  const byName = active.find((c) => c.name === DEFAULT_BUDGET_CATEGORY_NAME);
  if (byName) return byName.id;
  const byId = active.find((c) => c.id === DEFAULT_BUDGET_CATEGORY_ID);
  if (byId) return byId.id;
  return active[0]?.id ?? null;
}

/** Merge category-scoped network slice (projects + live aggregates) into shell period. */
export function mergeBudgetNetworkCategorySlice(
  shell: BudgetPeriod,
  slice: BudgetPeriod,
  categoryId: string,
): BudgetPeriod {
  const next = cloneDeep(shell);
  const cat = String(categoryId).trim();
  if (!cat) return next;

  for (const archSlice of slice.archetypes ?? []) {
    const arch = next.archetypes.find((a) => a.id === archSlice.id);
    if (!arch) continue;

    if (archSlice.budget?.[cat]) {
      arch.budget[cat] = { ...arch.budget[cat], ...cloneDeep(archSlice.budget[cat]) };
    }

    for (const huSlice of archSlice.units ?? []) {
      const hu = arch.units.find((u) => u.id === huSlice.id);
      if (!hu) continue;
      mergeHuCategorySlice(hu, huSlice, cat);
    }
  }

  return recalculateBudgets(next);
}

function mergeHuCategorySlice(hu: HospitalUnit, huSlice: HospitalUnit, categoryId: string): void {
  if (huSlice.budget?.[categoryId]) {
    hu.budget[categoryId] = { ...hu.budget[categoryId], ...cloneDeep(huSlice.budget[categoryId]) };
  }

  const otherProjects = (hu.projects ?? []).filter(
    (p) =>
      !p.isRoutineAssetAggregator &&
      String(p.budgetCategoryId ?? '') !== categoryId,
  );
  hu.projects = [...otherProjects, ...cloneDeep(huSlice.projects ?? [])];
}

export function shellSummaryUsesStoredAggregates(
  categoryId: string,
  loadedCategoryIds: ReadonlySet<string>,
): boolean {
  return !loadedCategoryIds.has(categoryId);
}
