import type { Archetype, BudgetPeriod } from '@/types';

export type ArchetypePlanChangeRow = {
  archetypeId: string;
  categoryId: string;
  budgetPlan: number;
};

export function applyArchetypePlanEdits(
  target: BudgetPeriod,
  source: BudgetPeriod,
  categoryIds: string[],
): void {
  source.archetypes.forEach((editedArch) => {
    const arch = target.archetypes.find((a) => a.id === editedArch.id);
    if (!arch) return;
    categoryIds.forEach((catId) => {
      const editedPlan = editedArch.budget[catId]?.budgetPlan;
      if (editedPlan === undefined || !arch.budget[catId]) return;
      arch.budget[catId].budgetPlan = editedPlan;
    });
  });
}

export function collectArchetypePlanChanges(
  original: BudgetPeriod,
  updated: BudgetPeriod,
  categoryIds: string[],
  archetypeIds?: string[],
): ArchetypePlanChangeRow[] {
  const allowedArchetypes = archetypeIds?.length ? new Set(archetypeIds) : null;
  const changes: ArchetypePlanChangeRow[] = [];

  for (const editedArch of updated.archetypes) {
    if (allowedArchetypes && !allowedArchetypes.has(editedArch.id)) continue;
    const originalArch = original.archetypes.find((a) => a.id === editedArch.id);
    if (!originalArch) continue;

    for (const catId of categoryIds) {
      const oldPlan = originalArch.budget[catId]?.budgetPlan ?? 0;
      const newPlan = editedArch.budget[catId]?.budgetPlan ?? 0;
      if (oldPlan !== newPlan) {
        changes.push({
          archetypeId: editedArch.id,
          categoryId: catId,
          budgetPlan: newPlan,
        });
      }
    }
  }

  return changes;
}
