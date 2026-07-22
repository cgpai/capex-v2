import type { ProjectListBundle, ProjectListDebugInfo } from './capexProjectListApi';

export type ProjectListSortOption = 'assetCode_asc' | 'assetCode_desc';

export const DEFAULT_PROJECT_LIST_SORT: ProjectListSortOption = 'assetCode_asc';

export const PROJECT_LIST_SORT_OPTIONS: { label: string; value: ProjectListSortOption }[] = [
  { label: 'Code Asset (A–Z)', value: 'assetCode_asc' },
  { label: 'Code Asset (Z–A)', value: 'assetCode_desc' },
];

/** Filters sent to POST /project-list/query (server-side). */
export type ProjectListServerFilters = {
  sortBy: ProjectListSortOption;
  search: string;
  huNames: string[];
  archetypeName: string | null;
  assetTypeGroupName: string | null;
  priorityNames: string[];
  budgetCategoryIds: string[];
  budgetFilter: 'low' | 'high' | null;
  completionMin: number;
  completionMax: number;
  finishedTasks: string[];
  scopeAll: boolean;
  scopeHuNames: string[];
  scopeArchetypeNames: string[];
  bddConstructionOnly?: boolean;
  hideUnassignedBdd?: boolean;
};

export type ProjectListQueryParams = ProjectListServerFilters & {
  periodName: string;
  userId: number;
  page: number;
  pageSize: number;
  skipCache?: boolean;
  /** When true, BE allows larger pageSize for export (not for table UI). */
  exportAll?: boolean;
};

export type ProjectListQueryResult = ProjectListBundle & {
  _debug?: ProjectListDebugInfo;
};

/** No archetype/HU/search/slicer filters — equivalent to "All" in the UI. */
export function isDefaultProjectListServerFilters(f: ProjectListServerFilters): boolean {
  return (
    (f.sortBy ?? DEFAULT_PROJECT_LIST_SORT) === DEFAULT_PROJECT_LIST_SORT &&
    !f.search.trim() &&
    f.huNames.length === 0 &&
    !f.archetypeName &&
    !f.assetTypeGroupName &&
    f.priorityNames.length === 0 &&
    f.finishedTasks.length === 0 &&
    !f.budgetFilter &&
    f.budgetCategoryIds.length === 0 &&
    f.completionMin === 0 &&
    f.completionMax === 100
  );
}

export function buildProjectListServerFilters(input: {
  searchTerm: string;
  selectedHUs: string[];
  meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
  selectedPriorities: string[];
  selectedBudgetCategoryIds: string[];
  selectedBudgetFilter: string | null;
  selectedFinishedTasks: string[];
  completionRange: { min: number; max: number };
  userScopes: {
    all: boolean;
    hus: Set<string>;
    archetypes: Set<string>;
  };
  bddConstructionOnly?: boolean;
  hideUnassignedBdd?: boolean;
  sortBy?: ProjectListSortOption;
}): ProjectListServerFilters {
  const bf = input.selectedBudgetFilter;
  const sortBy = input.sortBy ?? DEFAULT_PROJECT_LIST_SORT;
  const scopeAll = input.userScopes.all;
  return {
    sortBy,
    search: input.searchTerm.trim(),
    huNames: input.selectedHUs,
    archetypeName: input.meetingFilters.archetype,
    assetTypeGroupName: input.meetingFilters.assetTypeGroup,
    priorityNames: input.selectedPriorities,
    budgetCategoryIds: input.selectedBudgetCategoryIds,
    budgetFilter: bf === 'low' || bf === 'high' ? bf : null,
    completionMin: input.completionRange.min,
    completionMax: input.completionRange.max,
    finishedTasks: input.selectedFinishedTasks,
    scopeAll,
    // RBAC HU/archetype scope is resolved on the server from DB assignments — never sent from FE.
    scopeHuNames: [],
    scopeArchetypeNames: [],
    bddConstructionOnly: input.bddConstructionOnly ?? false,
    hideUnassignedBdd: input.hideUnassignedBdd ?? false,
  };
}
