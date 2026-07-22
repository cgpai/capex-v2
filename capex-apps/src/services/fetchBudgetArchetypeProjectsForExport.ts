import type { Project } from '../types';
import { getAllProjects } from './budgetService';
import {
  fetchProjectAssetCountsFromBackend,
} from './poApi';

export type BudgetArchetypeExportRow = {
  huName: string;
  project: Project;
  assetCount: number;
};

function sortExportRows(rows: BudgetArchetypeExportRow[]): BudgetArchetypeExportRow[] {
  return rows.slice().sort((a, b) => {
    const huCmp = a.huName.localeCompare(b.huName);
    if (huCmp !== 0) return huCmp;
    return (a.project.projectCode || '').localeCompare(b.project.projectCode || '');
  });
}

/**
 * Loads every project in a budget period for one archetype (paginated project fetch + batched asset counts).
 * Siloam screen bundle omits project metadata — do not use it for Excel export.
 */
export async function fetchBudgetArchetypeProjectsForExport(
  periodName: string,
  huUnits: { id: string; name: string }[],
): Promise<BudgetArchetypeExportRow[]> {
  const trimmedPeriod = periodName.trim();
  if (!trimmedPeriod || huUnits.length === 0) return [];

  const huIds = new Set(huUnits.map((u) => u.id));
  const huNameById = new Map(huUnits.map((u) => [u.id, u.name] as const));

  const allPeriodProjects = await getAllProjects(trimmedPeriod);
  const filtered = allPeriodProjects.filter((p): p is Project & { hospitalUnitId: string } => {
    const huId = p.hospitalUnitId;
    return (
      huId != null &&
      huIds.has(huId) &&
      !p.isRoutineAssetAggregator &&
      !p.isPipelineProject
    );
  });

  const assetCountByProjectId = new Map<string, number>();
  const countsFromBe = await fetchProjectAssetCountsFromBackend(trimmedPeriod);
  if (countsFromBe !== undefined) {
    for (const project of filtered) {
      const pid = String(project.id);
      assetCountByProjectId.set(pid, countsFromBe[pid] ?? 0);
    }
  } else {
    for (const project of filtered) {
      assetCountByProjectId.set(String(project.id), project.assets?.length ?? 0);
    }
  }

  const rows: BudgetArchetypeExportRow[] = filtered.map((project) => ({
    huName: huNameById.get(project.hospitalUnitId) || '',
    project,
    assetCount: assetCountByProjectId.get(String(project.id)) ?? 0,
  }));

  return sortExportRows(rows);
}

/** Single-HU export — same paginated full project fetch as archetype export. */
export async function fetchBudgetHuProjectsForExport(
  periodName: string,
  hu: { id: string; name: string },
): Promise<BudgetArchetypeExportRow[]> {
  return fetchBudgetArchetypeProjectsForExport(periodName, [hu]);
}
