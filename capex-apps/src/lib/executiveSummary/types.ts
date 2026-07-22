import type { Archetype, BudgetPeriod, Project } from '../../types';

export type CapexTypeFilter = 'all' | 'pipeline' | 'strategic' | 'general';
export type StatusFilter = 'all' | 'on-track' | 'at-risk' | 'off-track';
export type SortDir = 'asc' | 'desc';
export type ProjectSortField =
  | 'project_name'
  | 'completion_rate'
  | 'revenue_projection'
  | 'status'
  | 'target_start'
  | 'end_date';

export type EnrichedExecutiveProject = Project & {
  huName: string;
  huCode: string;
  archetypeName: string;
  archetypeId: string;
};

export type ExecutiveSummaryFilters = {
  archetypeId: string | null;
  capexType: CapexTypeFilter;
  status: StatusFilter;
  huCodes: readonly string[];
};

export type ExecutiveSummaryUnitOption = {
  id: string;
  code: string;
  name: string;
};

export type ExecutiveSummaryPeriodMeta = {
  periodName: string;
  startDate: string;
  endDate: string;
  multiYearName: string;
};

export type ExecutiveSummaryPageMeta = {
  periodName: string;
  periodMeta: ExecutiveSummaryPeriodMeta | null;
  hospitalUnits: { id: string; code: string; name: string; archetypeId: string }[];
  archetypes: { id: string; name: string }[];
};

export type LifecyclePreviewItem = {
  id: string;
  huCode: string;
  projectName: string;
  taskToDo: string | null;
  completionRate: number;
  status: number;
};

export type PlanningBudgetScoringAsset = {
  id: string;
  assetCode: string;
  assetName: string;
  budgetPlan: number;
};

export type PlanningBudgetScoringItem = {
  id: string;
  projectName: string;
  assetCode: string;
  budgetPlan: number;
  assets: PlanningBudgetScoringAsset[];
};

export type LifecycleBucketPreview = {
  count: number;
  items: LifecyclePreviewItem[];
};

export type PlanningBudgetScoringBucket = {
  count: number;
  items: PlanningBudgetScoringItem[];
};

export type ExecutiveSummaryPulse = {
  totalBudget: number;
  totalConsumed: number;
  remainingBudgetPlan: number;
  remainingBudgetPlanPct: number;
  approvedBudget: number;
  activeProjectCount: number;
  withProgressCount: number;
  withProgressPct: number;
  noEndDateCount: number;
  noEndDatePct: number;
  noBudgetPlanCount: number;
  noBudgetPlanPct: number;
};

export const EMPTY_EXECUTIVE_PULSE: ExecutiveSummaryPulse = {
  totalBudget: 0,
  totalConsumed: 0,
  remainingBudgetPlan: 0,
  remainingBudgetPlanPct: 0,
  approvedBudget: 0,
  activeProjectCount: 0,
  withProgressCount: 0,
  withProgressPct: 0,
  noEndDateCount: 0,
  noEndDatePct: 0,
  noBudgetPlanCount: 0,
  noBudgetPlanPct: 0,
};

export type ExecutiveSummaryStats = {
  totalProjectsInPeriod: number;
  filteredCount: number;
  activeHuCount: number;
  totalRevenue: number;
  totalAssetImpact: number;
  pulse: ExecutiveSummaryPulse;
  buckets: {
    preCon: PlanningBudgetScoringBucket;
    inCon: LifecycleBucketPreview;
    postCon: LifecycleBucketPreview;
    attention: LifecycleBucketPreview;
  };
};

export type ExecutiveSummaryProjectRow = {
  id: string;
  projectName: string;
  projectCode: string;
  huCode: string;
  huName: string;
  archetypeName: string;
  segment: string;
  assetCount: number;
  status: number;
  completionRate: number;
  revenueProjection: number;
  targetStart: string | null;
  endDate: string | null;
  taskToDo: string | null;
  owner: string;
  approvedBudget: number;
  isPipelineProject: boolean;
  type: string;
};

export type ExecutiveSummaryProjectsPage = {
  rows: ExecutiveSummaryProjectRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
};

export type ExecutiveSummaryProjectsQueryParams = ExecutiveSummaryFilters & {
  periodName: string;
  userId: number;
  page: number;
  pageSize: number;
  search: string;
  sortBy: ProjectSortField;
  sortDir: SortDir;
};

export type ExecutiveSummaryStatusLists = {
  offTrack: string[];
  notStarted: string[];
  inProgress: string[];
  completed: string[];
};

/** Legacy client-side view model (fallback only). */
export type ExecutiveLifecycleBuckets = {
  preCon: EnrichedExecutiveProject[];
  inCon: EnrichedExecutiveProject[];
  postCon: EnrichedExecutiveProject[];
  attention: EnrichedExecutiveProject[];
};

export type ExecutiveSummaryViewModel = {
  allProjects: EnrichedExecutiveProject[];
  filteredProjects: EnrichedExecutiveProject[];
  buckets: ExecutiveLifecycleBuckets;
  activeHuCount: number;
  assetImpact: number;
  revenueMn: number;
  statusLists: ExecutiveSummaryStatusLists;
};

export type ExecutiveSummaryPeriodForHeader = Pick<
  BudgetPeriod,
  'periodName' | 'startDate' | 'endDate' | 'multiYearName'
> | null;

export function unitOptionsFromMeta(
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
