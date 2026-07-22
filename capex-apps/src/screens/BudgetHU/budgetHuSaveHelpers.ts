import type { Asset, BudgetPeriod, HospitalUnit, Project } from '../../types';
import { findHuContainer } from './budgetHuHelpers';

export type BudgetHuSaveChanges = {
  changedProjectIds: Set<string>;
  deletedProjectIds: Set<string>;
  touchedAssetIds: Set<string>;
};

function assetFieldsChanged(prev: Asset, next: Asset): boolean {
  return (
    prev.assetName !== next.assetName ||
    (prev.description || '') !== (next.description || '') ||
    prev.budgetPlan !== next.budgetPlan ||
    prev.consumedBudget !== next.consumedBudget ||
    prev.workflowSetId !== next.workflowSetId ||
    (prev.assetTypeId || '') !== (next.assetTypeId || '') ||
    (prev.budgetCategoryId || '') !== (next.budgetCategoryId || '') ||
    (prev.endTargetDate || '') !== (next.endTargetDate || '') ||
    (prev.catalogueId || '') !== (next.catalogueId || '') ||
    (prev.poNumber || '') !== (next.poNumber || '') ||
    (prev.receivedQty || 0) !== (next.receivedQty || 0)
  );
}

function normalizePipelineData(project: Project) {
  return [...(project.pipelineData ?? [])]
    .map((row) => ({
      roomId: row.roomId,
      catalogueId: row.catalogueId,
      qty: Number(row.qty) || 0,
    }))
    .filter((row) => row.qty > 0)
    .sort((a, b) =>
      `${a.roomId}:${a.catalogueId}`.localeCompare(`${b.roomId}:${b.catalogueId}`),
    );
}

function projectFieldsChanged(prev: Project, next: Project): boolean {
  return (
    prev.projectName !== next.projectName ||
    (prev.axCode || '') !== (next.axCode || '') ||
    prev.budgetCategoryId !== next.budgetCategoryId ||
    prev.priorityId !== next.priorityId ||
    prev.budgetPlan !== next.budgetPlan ||
    prev.budgetCarryForward !== next.budgetCarryForward ||
    prev.approvedBudget !== next.approvedBudget ||
    prev.targetStart !== next.targetStart ||
    prev.endDate !== next.endDate ||
    prev.status !== next.status ||
    prev.plan !== next.plan ||
    (prev.stage ?? 0) !== (next.stage ?? 0) ||
    Boolean(prev.isPipelineProject) !== Boolean(next.isPipelineProject) ||
    JSON.stringify(normalizePipelineData(prev)) !== JSON.stringify(normalizePipelineData(next)) ||
    JSON.stringify(prev.categoryBudgetPlan || {}) !== JSON.stringify(next.categoryBudgetPlan || {})
  );
}

/** Diff satu HU terhadap snapshot server — hanya baris yang benar-benar berubah. */
export function collectBudgetHuSaveChanges(
  originalHU: HospitalUnit | null | undefined,
  editedHU: HospitalUnit | null | undefined,
): BudgetHuSaveChanges {
  const changedProjectIds = new Set<string>();
  const deletedProjectIds = new Set<string>();
  const touchedAssetIds = new Set<string>();

  if (!originalHU && !editedHU) {
    return { changedProjectIds, deletedProjectIds, touchedAssetIds };
  }

  const originalProjectMap = new Map((originalHU?.projects ?? []).map((p) => [p.id, p] as const));
  const editedProjectMap = new Map((editedHU?.projects ?? []).map((p) => [p.id, p] as const));

  for (const [projectId, editedProject] of editedProjectMap.entries()) {
    const originalProject = originalProjectMap.get(projectId);
    if (!originalProject) {
      changedProjectIds.add(projectId);
      editedProject.assets.forEach((a) => touchedAssetIds.add(a.id));
      continue;
    }

    const projectChanged = projectFieldsChanged(originalProject, editedProject);
    const originalAssetMap = new Map(originalProject.assets.map((a) => [a.id, a] as const));
    const editedAssetMap = new Map(editedProject.assets.map((a) => [a.id, a] as const));
    let assetChangedInProject = false;

    for (const [assetId, nextAsset] of editedAssetMap.entries()) {
      const prevAsset = originalAssetMap.get(assetId);
      if (!prevAsset || assetFieldsChanged(prevAsset, nextAsset)) {
        assetChangedInProject = true;
        touchedAssetIds.add(assetId);
      }
    }

    for (const removedAssetId of originalAssetMap.keys()) {
      if (!editedAssetMap.has(removedAssetId)) {
        assetChangedInProject = true;
        touchedAssetIds.add(removedAssetId);
      }
    }

    const pipelineDataChanged =
      Boolean(originalProject.isPipelineProject) &&
      JSON.stringify(normalizePipelineData(originalProject)) !==
        JSON.stringify(normalizePipelineData(editedProject));
    if (pipelineDataChanged) {
      assetChangedInProject = true;
      for (const asset of editedProject.assets) {
        touchedAssetIds.add(asset.id);
      }
    }

    if (projectChanged || assetChangedInProject) {
      changedProjectIds.add(projectId);
    }
  }

  for (const removedProjectId of originalProjectMap.keys()) {
    if (!editedProjectMap.has(removedProjectId)) {
      changedProjectIds.add(removedProjectId);
      deletedProjectIds.add(removedProjectId);
    }
  }

  return { changedProjectIds, deletedProjectIds, touchedAssetIds };
}

/** Payload kecil: hanya HU aktif + project yang berubah (untuk BE / Supabase incremental). */
export function buildBudgetHuPartialSavePeriod(
  recalculated: BudgetPeriod,
  huId: string,
  archetypeId: string | null,
  changedProjectIds: Set<string>,
  deletedProjectIds: Set<string>,
): BudgetPeriod {
  const container = findHuContainer(recalculated, huId, archetypeId);
  if (!container) return recalculated;

  const activeChangedIds = new Set(
    [...changedProjectIds].filter((id) => !deletedProjectIds.has(id)),
  );
  const projects = container.hu.projects.filter((p) => activeChangedIds.has(p.id));

  return {
    periodName: recalculated.periodName,
    multiYearName: recalculated.multiYearName,
    startDate: recalculated.startDate,
    endDate: recalculated.endDate,
    budget: recalculated.budget,
    archetypes: [
      {
        ...container.archetype,
        units: [
          {
            ...container.hu,
            projects,
          },
        ],
      },
    ],
  };
}

/**
 * Merge server-assigned project/asset codes from a partial save response back into the full period.
 * Prevents UI from keeping a collided client-side code after backend remapped it.
 */
export function applySavedCodeRemaps(
  fullPeriod: BudgetPeriod,
  savedPartial: BudgetPeriod | null | undefined,
  huId: string | null,
): { period: BudgetPeriod; remappedCodes: string[] } {
  const remappedCodes: string[] = [];
  if (!savedPartial || !huId) return { period: fullPeriod, remappedCodes };

  const savedHu = savedPartial.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
  if (!savedHu) return { period: fullPeriod, remappedCodes };

  const byId = new Map(savedHu.projects.map((p) => [p.id, p] as const));
  const next = {
    ...fullPeriod,
    archetypes: fullPeriod.archetypes.map((arch) => ({
      ...arch,
      units: arch.units.map((unit) => {
        if (unit.id !== huId) return unit;
        return {
          ...unit,
          projects: unit.projects.map((project) => {
            const saved = byId.get(project.id);
            if (!saved) return project;
            let changed = false;
            let projectCode = project.projectCode;
            if (saved.projectCode && saved.projectCode !== project.projectCode) {
              remappedCodes.push(`${project.projectCode} → ${saved.projectCode}`);
              projectCode = saved.projectCode;
              changed = true;
            }
            const savedAssets = new Map((saved.assets ?? []).map((a) => [a.id, a] as const));
            const assets = (project.assets ?? []).map((asset) => {
              const sa = savedAssets.get(asset.id);
              if (!sa?.assetCode || sa.assetCode === asset.assetCode) return asset;
              remappedCodes.push(`${asset.assetCode} → ${sa.assetCode}`);
              changed = true;
              return { ...asset, assetCode: sa.assetCode };
            });
            return changed ? { ...project, projectCode, assets } : project;
          }),
        };
      }),
    })),
  };
  return { period: next, remappedCodes };
}
