import type { Archetype, BudgetPeriod } from '@/types';

export type HuBudgetPlanChangeRow = {
  hospitalUnitId: string;
  categoryId: string;
  budgetPlan: number;
};

export function applyHuPlanEdits(
  target: BudgetPeriod,
  source: BudgetPeriod,
  archetypeId: string,
  categoryIds: string[],
): void {
  const sourceArch = source.archetypes.find((a) => a.id === archetypeId);
  const targetArch = target.archetypes.find((a) => a.id === archetypeId);
  if (!sourceArch || !targetArch) return;

  sourceArch.units.forEach((editedHu) => {
    const hu = targetArch.units.find((u) => u.id === editedHu.id);
    if (!hu) return;
    categoryIds.forEach((catId) => {
      const editedPlan = editedHu.budget[catId]?.budgetPlan;
      if (editedPlan === undefined) return;
      if (!hu.budget[catId]) {
        hu.budget[catId] = {
          budgetPlan: 0,
          budgetCarryForward: 0,
          budgetAllocated: 0,
          approvedBudget: 0,
          consumedBudget: 0,
        };
      }
      hu.budget[catId].budgetPlan = editedPlan;
    });
  });
}

export function collectHuPlanChanges(
  original: BudgetPeriod,
  updated: BudgetPeriod,
  categoryIds: string[],
  archetypeId: string,
): HuBudgetPlanChangeRow[] {
  const originalArch = original.archetypes.find((a) => a.id === archetypeId);
  const updatedArch = updated.archetypes.find((a) => a.id === archetypeId);
  if (!originalArch || !updatedArch) return [];

  const changes: HuBudgetPlanChangeRow[] = [];

  for (const editedHu of updatedArch.units) {
    const originalHu = originalArch.units.find((u) => u.id === editedHu.id);
    if (!originalHu) continue;

    for (const catId of categoryIds) {
      const oldPlan = originalHu.budget[catId]?.budgetPlan ?? 0;
      const newPlan = editedHu.budget[catId]?.budgetPlan ?? 0;
      if (oldPlan !== newPlan) {
        changes.push({
          hospitalUnitId: editedHu.id,
          categoryId: catId,
          budgetPlan: newPlan,
        });
      }
    }
  }

  return changes;
}
