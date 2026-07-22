import {
  findRoutineProject,
  isRoutineAssetProject,
  sumHuCategoryLiveAggregates,
  sumHuCategoryProjectBudgetPlan,
} from '../../lib/budgetCategoryAggregates';
import type {
  Archetype,
  Asset,
  BudgetCategoryConfig,
  BudgetPeriod,
  BudgetSummaryRow,
  HospitalUnit,
  Project,
} from '../../types';
import { compareAssetCodes } from '../CapexProjectList/listUtils';

export { sumHuCategoryLiveAggregates, sumHuCategoryProjectBudgetPlan } from '../../lib/budgetCategoryAggregates';

export function compareProjectCodes(
  a: string | undefined | null,
  b: string | undefined | null,
): number {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' });
}

/** Timestamp embedded in client-generated ids (`PROJ-…-{Date.now()}`, `ASSET-…-{Date.now()}-…`). */
function extractRecencyFromId(id: string | undefined | null): number {
  const match = String(id ?? '').match(/(\d{10,13})/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** Newest project first — higher project code, then newer id timestamp. */
export function sortProjectsByCode(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const byCode = compareProjectCodes(b.projectCode, a.projectCode);
    if (byCode !== 0) return byCode;
    return extractRecencyFromId(b.id) - extractRecencyFromId(a.id);
  });
}

/** Ascending by asset code (e.g. `SHLV.26.00.001` → `SHLV.26.00.010`). */
export function sortAssetsByCode(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => compareAssetCodes(a.assetCode, b.assetCode));
}

export function filterAssets(
  assets: Asset[],
  searchTerm: string,
  categories: BudgetCategoryConfig[] = [],
): Asset[] {
  const trimmed = searchTerm.trim();
  if (!trimmed) return assets;
  const lowerSearch = trimmed.toLowerCase();
  const termCode = lowerSearch.replace(/\s+/g, '');
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));

  return assets.filter((asset) => {
    const code = (asset.assetCode ?? '').toLowerCase();
    const name = (asset.assetName ?? '').toLowerCase();
    const desc = (asset.description ?? '').toLowerCase();
    const category = categoryNameById.get(asset.budgetCategoryId) ?? '';
    return (
      code.includes(lowerSearch) ||
      code.replace(/\s+/g, '').includes(termCode) ||
      name.includes(lowerSearch) ||
      desc.includes(lowerSearch) ||
      category.includes(lowerSearch)
    );
  });
}

export function withSortedAssets<T extends Project>(project: T): T {
  if (!project.assets?.length) return project;
  return { ...project, assets: sortAssetsByCode(project.assets) };
}

export function findHuContainer(
  period: BudgetPeriod,
  huId: string | null,
  archetypeId: string | null,
): { archetype: Archetype; hu: HospitalUnit } | null {
  if (!huId) return null;
  const searchInArchetype = (arch: Archetype) => {
    const hu = arch.units.find((u) => u.id === huId);
    return hu ? { archetype: arch, hu } : null;
  };
  if (archetypeId) {
    const preferredArch = period.archetypes.find((a) => a.id === archetypeId);
    if (preferredArch) {
      const match = searchInArchetype(preferredArch);
      if (match) return match;
    }
  }
  for (const arch of period.archetypes) {
    const match = searchInArchetype(arch);
    if (match) return match;
  }
  return null;
}

export function getSelectedHU(
  period: BudgetPeriod | null,
  huId: string | null,
  archetypeId: string | null,
): HospitalUnit | null {
  if (!period || !huId) return null;
  return findHuContainer(period, huId, archetypeId)?.hu ?? null;
}

/** First occurrence wins — prevents duplicate React keys when streams overlap. */
export function dedupeProjectsById(projects: Project[]): Project[] {
  const seen = new Set<string>();
  const out: Project[] = [];
  for (const project of projects) {
    const key = project.id?.trim();
    if (!key) {
      out.push(project);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(project);
  }
  return out;
}

export function dedupeHuProjectsInPeriod(period: BudgetPeriod): void {
  for (const arch of period.archetypes) {
    for (const unit of arch.units) {
      unit.projects = dedupeProjectsById(unit.projects);
    }
  }
}

/**
 * Fold a HU-scoped server snapshot into an existing period tree so other HUs'
 * already-loaded projects are preserved when switching units.
 */
export function mergeScopedHuIntoPeriod(
  base: BudgetPeriod | null | undefined,
  scoped: BudgetPeriod,
  hospitalUnitId: string,
): BudgetPeriod {
  const huId = String(hospitalUnitId).trim();
  if (!huId) return scoped;
  if (!base || base.periodName !== scoped.periodName) return scoped;

  const next: BudgetPeriod = cloneDeepBudgetPeriod(base);
  // Ensure master structure from scoped (complete dropdown).
  for (const scopedArch of scoped.archetypes ?? []) {
    let arch = next.archetypes.find((a) => a.id === scopedArch.id);
    if (!arch) {
      next.archetypes.push(cloneDeepBudgetPeriod({ ...scoped, archetypes: [scopedArch] }).archetypes[0]);
      continue;
    }
    for (const scopedUnit of scopedArch.units ?? []) {
      let unit = arch.units.find((u) => u.id === scopedUnit.id);
      if (!unit) {
        arch.units.push(JSON.parse(JSON.stringify(scopedUnit)));
        continue;
      }
      // Always sync master-data flags from server (e.g. isPipeline), even for non-active HUs.
      if (typeof scopedUnit.isPipeline === 'boolean') {
        unit.isPipeline = scopedUnit.isPipeline;
      }
      unit.name = scopedUnit.name || unit.name;
      if (scopedUnit.code != null && String(scopedUnit.code).trim()) {
        unit.code = scopedUnit.code;
      }
      if (String(scopedUnit.id) === huId) {
        unit.projects = JSON.parse(JSON.stringify(scopedUnit.projects ?? []));
        if (scopedUnit.budget) unit.budget = JSON.parse(JSON.stringify(scopedUnit.budget));
      }
    }
  }
  if (scoped.budget) next.budget = { ...next.budget, ...scoped.budget };
  return next;
}

function cloneDeepBudgetPeriod(period: BudgetPeriod): BudgetPeriod {
  return JSON.parse(JSON.stringify(period)) as BudgetPeriod;
}

/**
 * While the user has unsaved edits, fold in peer projects from a realtime/server snapshot
 * without overwriting local dirty rows (matched by project id).
 * Same-id rows adopt server projectCode (allocate/remap) while keeping local field edits.
 */
export function mergeRemotePeersPreservingLocalEdits(
  local: BudgetPeriod,
  remote: BudgetPeriod,
): BudgetPeriod {
  const next: BudgetPeriod = {
    ...local,
    archetypes: local.archetypes.map((arch) => {
      const remoteArch = remote.archetypes.find((a) => a.id === arch.id) ?? null;
      return {
        ...arch,
        units: arch.units.map((unit) => {
          const remoteUnit =
            remoteArch?.units.find((u) => u.id === unit.id) ??
            remote.archetypes.flatMap((a) => a.units).find((u) => u.id === unit.id) ??
            null;
          if (!remoteUnit) return unit;

          const localById = new Map(unit.projects.map((p) => [p.id, p] as const));
          const merged = [...unit.projects];
          for (const remoteProject of remoteUnit.projects ?? []) {
            if (!localById.has(remoteProject.id)) {
              merged.push(remoteProject);
            } else {
              const localProject = localById.get(remoteProject.id)!;
              const localAssets = localProject.assets?.length ?? 0;
              const remoteAssets = remoteProject.assets?.length ?? 0;
              const idx = merged.findIndex((p) => p.id === remoteProject.id);
              if (idx < 0) continue;
              const remoteCode = String(remoteProject.projectCode ?? '').trim();
              const localCode = String(localProject.projectCode ?? '').trim();
              const nextProject: Project = {
                ...localProject,
                // Server is source of truth for allocated codes after save/remap.
                projectCode: remoteCode || localCode,
              };
              if (localAssets === 0 && remoteAssets > 0) {
                nextProject.assets = remoteProject.assets;
              }
              merged[idx] = nextProject;
            }
          }
          return {
            ...unit,
            projects: dedupeProjectsById(merged),
            ...(typeof remoteUnit.isPipeline === 'boolean'
              ? { isPipeline: remoteUnit.isPipeline }
              : {}),
            name: remoteUnit.name || unit.name,
            code: remoteUnit.code || unit.code,
          };
        }),
      };
    }),
  };
  return next;
}

export function splitHuProjects(hu: HospitalUnit | null) {
  if (!hu) {
    return { routineAssetProject: null as Project | null, regularProjects: [] as Project[], pipelineProjects: [] as Project[] };
  }
  const projects = dedupeProjectsById(hu.projects);
  const routine = findRoutineProject(hu);
  const regular = sortProjectsByCode(
    projects.filter((p) => !isRoutineAssetProject(p) && !p.isPipelineProject),
  );
  const pipeline = projects.filter((p) => p.isPipelineProject);
  return {
    routineAssetProject: routine ? withSortedAssets(routine) : null,
    regularProjects: regular,
    pipelineProjects: pipeline,
  };
}

export function filterRegularProjects(
  projects: Project[],
  searchTerm: string,
  categories: BudgetCategoryConfig[],
): Project[] {
  const trimmed = searchTerm.trim();
  if (!trimmed) return projects;
  const lowerSearch = trimmed.toLowerCase();
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));

  return projects.filter((project) => {
    const matchesProject =
      project.projectCode?.toLowerCase().includes(lowerSearch) ||
      project.projectName?.toLowerCase().includes(lowerSearch) ||
      project.axCode?.toLowerCase().includes(lowerSearch) ||
      (categoryNameById.get(project.budgetCategoryId) ?? '').includes(lowerSearch);

    const matchesAssets = project.assets?.some(
      (asset) =>
        asset.assetCode?.toLowerCase().includes(lowerSearch) ||
        asset.assetName?.toLowerCase().includes(lowerSearch) ||
        asset.description?.toLowerCase().includes(lowerSearch),
    );

    return matchesProject || matchesAssets;
  });
}

/**
 * Unit-level budget plan configured in Budget Archetype (`budget_period_hospital_unit_budgets`).
 * Prefer the authoritative HU snapshot (App shell period) when local HU state only
 * contains project-aggregated plans from cache merge.
 */
export function resolveUnitCategoryBudgetPlan(
  hu: HospitalUnit,
  categoryId: string,
  authoritativeHu?: HospitalUnit | null,
): number {
  const authoritativePlan = authoritativeHu?.budget[categoryId]?.budgetPlan;
  if (authoritativePlan != null && authoritativePlan > 0) {
    return authoritativePlan;
  }

  const storedPlan = hu.budget[categoryId]?.budgetPlan ?? 0;
  if (storedPlan <= 0) return 0;

  const projectSum = sumHuCategoryProjectBudgetPlan(hu, categoryId);
  if (storedPlan !== projectSum) return storedPlan;

  return storedPlan;
}

export function buildBudgetHuSummaryRows(
  hu: HospitalUnit,
  categories: BudgetCategoryConfig[],
  authoritativeHu?: HospitalUnit | null,
): BudgetSummaryRow[] {
  return categories
    .filter((c) => c.isActive)
    .map((cat) => {
      const unitBudgetPlan = resolveUnitCategoryBudgetPlan(hu, cat.id, authoritativeHu);
      const totalAllocated = sumHuCategoryProjectBudgetPlan(hu, cat.id);
      const live = sumHuCategoryLiveAggregates(hu, cat.id);

      return {
        categoryId: cat.id,
        type: cat.name,
        budgetPlan: unitBudgetPlan,
        budgetCarryForward: live.budgetCarryForward,
        budgetAllocated: totalAllocated,
        approvedBudget: live.approvedBudget,
        consumedBudget: live.consumedBudget,
      };
    });
}

/** Instant asset badges from nested project.assets (disk / preload). */
export function buildAssetCountMapFromPeriod(
  period: BudgetPeriod | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!period?.archetypes?.length) return map;
  for (const arch of period.archetypes) {
    for (const unit of arch.units) {
      for (const project of unit.projects ?? []) {
        const count = project.assets?.length ?? 0;
        if (count > 0) {
          map.set(project.id, count);
        }
      }
    }
  }
  return map;
}
