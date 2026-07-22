import { ProjectStatus, ProjectType } from '../../types';
import type { Archetype, BudgetPeriod } from '../../types';
import { sumProjectConsumedBudget } from '../budgetCategoryAggregates';
import type {
  EnrichedExecutiveProject,
  ExecutiveLifecycleBuckets,
  ExecutiveSummaryFilters,
  ExecutiveSummaryPeriodForHeader,
  ExecutiveSummaryStatusLists,
  ExecutiveSummaryUnitOption,
  ExecutiveSummaryViewModel,
  PlanningBudgetScoringItem,
} from './types';

export type {
  EnrichedExecutiveProject,
  ExecutiveLifecycleBuckets,
  ExecutiveSummaryFilters,
  ExecutiveSummaryStatusLists,
  ExecutiveSummaryUnitOption,
  ExecutiveSummaryViewModel,
  CapexTypeFilter,
  StatusFilter,
} from './types';

export function normalizeProjectStatus(status: unknown): ProjectStatus {
  if (status === ProjectStatus.OnTrack || status === 0 || status === '0' || status === 'OnTrack' || status === 'On Track') {
    return ProjectStatus.OnTrack;
  }
  if (status === ProjectStatus.AtRisk || status === 1 || status === '1' || status === 'AtRisk' || status === 'At Risk') {
    return ProjectStatus.AtRisk;
  }
  return ProjectStatus.OffTrack;
}

export function normalizeCompletionRate(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function flattenProjectsFromPeriod(period: BudgetPeriod | null | undefined): EnrichedExecutiveProject[] {
  if (!period?.archetypes) return [];
  const rows: EnrichedExecutiveProject[] = [];
  for (const arch of period.archetypes) {
    for (const unit of arch.units) {
      for (const proj of unit.projects) {
        rows.push({
          ...proj,
          status: normalizeProjectStatus(proj.status),
          completionRate: normalizeCompletionRate(proj.completionRate),
          revenueProjection: Number(proj.revenueProjection) || 0,
          huName: unit.name,
          huCode: unit.code || '',
          archetypeName: arch.name,
          archetypeId: arch.id,
        });
      }
    }
  }
  return rows;
}

export function filterExecutiveProjects(
  projects: EnrichedExecutiveProject[],
  filters: ExecutiveSummaryFilters,
): EnrichedExecutiveProject[] {
  let result = projects;

  if (filters.archetypeId) {
    result = result.filter((p) => String(p.archetypeId) === String(filters.archetypeId));
  }

  if (filters.capexType === 'pipeline') {
    result = result.filter((p) => p.isPipelineProject || p.type === ProjectType.ProjectPipeline);
  } else if (filters.capexType === 'strategic') {
    result = result.filter(
      (p) => p.type === ProjectType.Strategic && !p.isPipelineProject,
    );
  } else if (filters.capexType === 'general') {
    result = result.filter((p) => p.type === ProjectType.GeneralAndRoutine);
  }

  if (filters.status === 'on-track') {
    result = result.filter((p) => p.status === ProjectStatus.OnTrack);
  } else if (filters.status === 'at-risk') {
    result = result.filter((p) => p.status === ProjectStatus.AtRisk);
  } else if (filters.status === 'off-track') {
    result = result.filter((p) => p.status === ProjectStatus.OffTrack);
  }

  if (filters.huCodes.length > 0) {
    const allowed = new Set(filters.huCodes);
    result = result.filter((p) => allowed.has(p.huCode));
  }

  return result;
}

export function bucketProjectsByLifecycle(projects: EnrichedExecutiveProject[]): ExecutiveLifecycleBuckets {
  const preCon = projects.filter((p) => p.completionRate === 0 && p.status !== ProjectStatus.OffTrack);
  const inCon = projects.filter((p) => p.completionRate > 0 && p.completionRate < 100);
  const postCon = projects.filter((p) => p.completionRate === 100);
  const attention = projects.filter(
    (p) => p.status === ProjectStatus.AtRisk || p.status === ProjectStatus.OffTrack,
  );
  return { preCon, inCon, postCon, attention };
}

const PLANNING_SCORING_LIMIT = 15;

export function buildPlanningBudgetScoringItems(
  preConProjects: EnrichedExecutiveProject[],
): PlanningBudgetScoringItem[] {
  return [...preConProjects]
    .sort((a, b) => {
      const av = Number(a.budgetPlan ?? 0) + Number(a.budgetCarryForward ?? 0);
      const bv = Number(b.budgetPlan ?? 0) + Number(b.budgetCarryForward ?? 0);
      return bv - av;
    })
    .slice(0, PLANNING_SCORING_LIMIT)
    .map((p) => {
      const assets = (p.assets ?? []).map((a) => ({
        id: a.id,
        assetCode: a.assetCode || '',
        assetName: a.assetName || '',
        budgetPlan: Number(a.budgetPlan ?? 0),
      }));
      const projectAssetCode = String(p.assetCode ?? '').trim();
      return {
        id: p.id,
        projectName: p.projectName,
        assetCode: projectAssetCode || assets[0]?.assetCode || '—',
        budgetPlan: Number(p.budgetPlan ?? 0) + Number(p.budgetCarryForward ?? 0),
        assets,
      };
    });
}

export function projectStatusLabel(status: ProjectStatus): string {
  if (status === ProjectStatus.OnTrack) return 'On Track';
  if (status === ProjectStatus.AtRisk) return 'At Risk';
  return 'Off Track';
}

export function projectStatusColorClass(status: ProjectStatus): string {
  if (status === ProjectStatus.AtRisk) return 'text-orange-600';
  if (status === ProjectStatus.OffTrack) return 'text-red-600';
  return 'text-siloam-green';
}

export function formatTargetQuarter(dateStr?: string): string {
  if (!dateStr?.trim()) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const q = Math.floor(d.getMonth() / 3) + 1;
  const y = String(d.getFullYear()).slice(-2);
  return `Q${q}'${y}`;
}

export function formatAsOfLabel(period: BudgetPeriod | ExecutiveSummaryPeriodForHeader | null | undefined): string {
  if (!period) return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const ref = period.endDate || period.startDate;
  if (ref?.trim()) {
    const d = new Date(ref);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  return period.periodName;
}

export function fiscalYearLabel(period: BudgetPeriod | ExecutiveSummaryPeriodForHeader | null | undefined): string {
  if (!period) return '';
  if (period.startDate?.trim()) {
    const y = new Date(period.startDate).getFullYear();
    if (Number.isFinite(y)) return `FISCAL YEAR ${y} PLAN`;
  }
  return period.periodName.toUpperCase();
}

export function formatProjectListLabel(project: Pick<EnrichedExecutiveProject, 'projectName' | 'huName'>): string {
  return `${project.projectName} - ${project.huName}`;
}

export function countDistinctHuCodes(projects: EnrichedExecutiveProject[]): number {
  return new Set(projects.map((p) => p.huCode).filter(Boolean)).size;
}

export function totalAssetImpact(projects: EnrichedExecutiveProject[]): number {
  return projects.reduce((sum, p) => sum + (p.assets?.length ?? 0), 0);
}

export function totalRevenueProjectionMn(projects: EnrichedExecutiveProject[]): number {
  return projects.reduce((sum, p) => sum + (p.revenueProjection || 0), 0);
}

export function visibleUnitsFromArchetypes(
  visibleArchetypes: Archetype[] | undefined,
  selectedArchetypeId: string | null,
): ExecutiveSummaryUnitOption[] {
  const arches = selectedArchetypeId
    ? visibleArchetypes?.filter((a) => String(a.id) === String(selectedArchetypeId)) ?? []
    : visibleArchetypes ?? [];
  const units: ExecutiveSummaryUnitOption[] = [];
  for (const arch of arches) {
    for (const unit of arch.units) {
      units.push({ id: unit.id, code: unit.code || unit.name, name: unit.name });
    }
  }
  return units;
}

export function buildStatusLists(
  filtered: EnrichedExecutiveProject[],
  buckets: ExecutiveLifecycleBuckets,
): ExecutiveSummaryStatusLists {
  return {
    offTrack: filtered.filter((p) => p.status === ProjectStatus.OffTrack).map(formatProjectListLabel),
    notStarted: buckets.preCon.map(formatProjectListLabel),
    inProgress: buckets.inCon.map(formatProjectListLabel),
    completed: buckets.postCon.map(formatProjectListLabel),
  };
}

export function buildPulseFromProjects(
  filtered: EnrichedExecutiveProject[],
): import('./types').ExecutiveSummaryPulse {
  const filteredCount = filtered.length;
  const withProgressCount = filtered.filter((p) => p.completionRate > 0).length;
  const noEndDateCount = filtered.filter((p) => !String(p.endDate ?? '').trim()).length;
  const noBudgetPlanCount = filtered.filter((p) => !Number(p.budgetPlan ?? 0)).length;

  const totalBudget = filtered.reduce(
    (s, p) => s + Number(p.budgetPlan ?? 0) + Number(p.budgetCarryForward ?? 0),
    0,
  );
  const totalConsumed = filtered.reduce((s, p) => s + sumProjectConsumedBudget(p), 0);
  const approvedBudget = filtered.reduce((s, p) => s + Number(p.approvedBudget ?? 0), 0);

  const remainingBudgetPlan = Math.max(0, totalBudget - totalConsumed);
  const remainingBudgetPlanPct =
    totalBudget > 0 ? Math.round((remainingBudgetPlan / totalBudget) * 1000) / 10 : 0;
  const withProgressPct =
    filteredCount > 0 ? Math.round((withProgressCount / filteredCount) * 1000) / 10 : 0;
  const noEndDatePct =
    filteredCount > 0 ? Math.round((noEndDateCount / filteredCount) * 1000) / 10 : 0;
  const noBudgetPlanPct =
    filteredCount > 0 ? Math.round((noBudgetPlanCount / filteredCount) * 1000) / 10 : 0;

  return {
    totalBudget,
    totalConsumed,
    remainingBudgetPlan,
    remainingBudgetPlanPct,
    approvedBudget,
    activeProjectCount: filteredCount,
    withProgressCount,
    withProgressPct,
    noEndDateCount,
    noEndDatePct,
    noBudgetPlanCount,
    noBudgetPlanPct,
  };
}

export function buildExecutiveSummaryViewModel(
  period: BudgetPeriod | null | undefined,
  filters: ExecutiveSummaryFilters,
): ExecutiveSummaryViewModel {
  const allProjects = flattenProjectsFromPeriod(period);
  const filteredProjects = filterExecutiveProjects(allProjects, filters);
  const buckets = bucketProjectsByLifecycle(filteredProjects);

  return {
    allProjects,
    filteredProjects,
    buckets,
    activeHuCount: countDistinctHuCodes(filteredProjects),
    assetImpact: totalAssetImpact(filteredProjects),
    revenueMn: totalRevenueProjectionMn(filteredProjects),
    statusLists: buildStatusLists(filteredProjects, buckets),
  };
}

export function toggleHuCodeInList(codes: readonly string[], code: string): string[] {
  if (!code) return [];
  const set = new Set(codes);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  return [...set];
}
