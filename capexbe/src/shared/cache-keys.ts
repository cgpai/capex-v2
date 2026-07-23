/** Structured Redis / memory cache keys — app:{module}:{resource}:{id} */
export const CACHE_TTL_MS = {
  REFERENCE: 60 * 60 * 1000,
  MASTER: 30 * 60 * 1000,
  PERMISSIONS: 15 * 60 * 1000,
  DASHBOARD: 5 * 60 * 1000,
  TABLE: 5 * 60 * 1000,
  FREQUENT: 2 * 60 * 1000,
} as const;

const normPeriod = (periodName: string) => periodName.trim().toLowerCase();

export const cacheKeys = {
  budgetHuPage: (userId: number, periodName: string, hospitalUnitId?: string) => {
    const hu = String(hospitalUnitId ?? '').trim();
    return hu
      ? `app:table:budget-hu:page:${userId}:${normPeriod(periodName)}:hu:${hu}`
      : `app:table:budget-hu:page:${userId}:${normPeriod(periodName)}`;
  },
  budgetHuPeriod: (userId: number, periodName: string) =>
    `app:table:budget-hu:period:${userId}:${normPeriod(periodName)}`,
  budgetHuPeriodNetwork: (userId: number, periodName: string) =>
    `app:table:budget-hu:period-network:${userId}:${normPeriod(periodName)}`,
  budgetHuPeriodNetworkShell: (userId: number, periodName: string) =>
    `app:table:budget-hu:period-network-shell:${userId}:${normPeriod(periodName)}`,
  budgetHuPeriodNetworkCategory: (userId: number, periodName: string, categoryId: string) =>
    `app:table:budget-hu:period-network:${userId}:${normPeriod(periodName)}:cat:${categoryId.trim().toLowerCase()}`,
  budgetHuPeriodStructure: (userId: number, periodName: string) =>
    `app:table:budget-hu:period-structure:${userId}:${normPeriod(periodName)}`,
  budgetHuConfig: () => 'app:master:budget-hu:config',
  budgetHuAssetCounts: (userId: number, periodName: string) =>
    `app:table:budget-hu:asset-counts:${userId}:${normPeriod(periodName)}`,
  dashboard: (userId: number, periodName: string) =>
    `app:dashboard:${userId}:${normPeriod(periodName)}`,
  projectListPage: (userId: number, periodName: string, page = 1, pageSize = 200) =>
    `app:table:project-list:page:${userId}:${normPeriod(periodName)}:${page}:${pageSize}`,
  projectListMaster: (userId: number) => `app:master:project-list:${userId}`,
  myTasksPage: (userId: number, periodName: string) =>
    `app:table:my-tasks:page:${userId}:${normPeriod(periodName)}`,
  configurationSlice: (userId: number, slice: string) =>
    `app:table:configuration:slice:${userId}:${slice}`,
  budgetMultiYearPage: (userId: number) => `app:table:budget-multi-year:page:${userId}`,
  budgetMultiYearPeriodBudgets: (userId: number, multiYearName: string) =>
    `app:table:budget-multi-year:period-budgets:${userId}:${multiYearName.trim().toLowerCase()}`,
  poUpdatePage: (userId: number, periodName: string) =>
    `app:table:po-update:page:${userId}:${normPeriod(periodName || 'all')}`,
  fsUpdatePage: (userId: number, periodName: string) =>
    `app:table:fs-update:page:${userId}:${normPeriod(periodName)}`,
  executiveDashboardMetrics: (userId: number, periodName: string, filtersKey: string) =>
    `app:dashboard:executive:${userId}:${normPeriod(periodName)}:${filtersKey}`,
  momDailySummary: (userId: number, periodName: string, summaryDate: string) =>
    `app:table:mom-daily-summary:${userId}:${normPeriod(periodName)}:${summaryDate.trim()}`,
  bddConstructionScan: (userId: number, periodName: string, filterHash: string) =>
    `app:table:bdd-construction:scan:${userId}:${normPeriod(periodName)}:${filterHash}`,
};

const MASTER_CONFIG_SLICES = new Set([
  'archetypes',
  'hospitalUnits',
  'regionals',
  'roles',
  'assetTypeGroups',
  'budgetCategories',
  'projectPriorities',
  'assetTags',
  'assetTypeConfigs',
  'tasks',
]);

export function configurationSliceTtlMs(slice: string): number {
  return MASTER_CONFIG_SLICES.has(slice) ? CACHE_TTL_MS.MASTER : CACHE_TTL_MS.TABLE;
}
