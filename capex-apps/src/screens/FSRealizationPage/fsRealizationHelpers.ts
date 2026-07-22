import type { EnrichedFS } from '../../hooks/queries/fetchFsRealizationPageData';
import { FS_AMOUNT_MN_TO_IDR } from '../../hooks/queries/fetchFsUpdatePageData';

/** Budget category NR — New Revenue Generating only. */
export const NR_BUDGET_CATEGORY_ID = 'cat-new-rev-gen';

export function isApprovedFsConclusion(conclusion: unknown): boolean {
  const value = String(conclusion || '').trim();
  return value === 'Approved' || value === 'Approved with Notes';
}

export function isNewRevenueGeneratingCategory(categoryName: string, categoryId?: string): boolean {
  if (categoryId === NR_BUDGET_CATEGORY_ID) return true;
  const normalized = categoryName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'nr') return true;
  return normalized.includes('new revenue');
}

export function filterNrFeasibilityStudies(items: EnrichedFS[]): EnrichedFS[] {
  return items.filter(
    (fs) =>
      isApprovedFsConclusion(fs.conclusion) &&
      isNewRevenueGeneratingCategory(fs.capexCategoryName),
  );
}

export function toFsApprovedBudgetIdr(amountMn: number): number {
  return (Number(amountMn) || 0) * FS_AMOUNT_MN_TO_IDR;
}

export function computeGapBudgetIdr(approvedBudgetMn: number, totalRealizationIdr: number): number {
  return toFsApprovedBudgetIdr(approvedBudgetMn) - (Number(totalRealizationIdr) || 0);
}

/** Per-month gap: actual revenue − monthly revenue plan for that month. */
export function computeMonthlyGapBudgetIdr(monthlyPlanIdr: number, actualRevenueIdr: number): number {
  return (Number(actualRevenueIdr) || 0) - (Number(monthlyPlanIdr) || 0);
}

/** Cumulative gap vs monthly plan through elapsed months. */
export function computeTotalMonthlyPlanGapIdr(
  monthlyPlanIdr: number,
  monthCount: number,
  totalRealizationIdr: number,
): number {
  return (Number(totalRealizationIdr) || 0) - (Number(monthlyPlanIdr) || 0) * monthCount;
}

export function formatThroughputQty(value: number): string {
  return (Number(value) || 0).toLocaleString('id-ID');
}

export function computeGapThroughput(plannedThroughput: number, totalActualThroughput: number): number {
  return (Number(plannedThroughput) || 0) - (Number(totalActualThroughput) || 0);
}

/** Per-month gap: actual throughput − planned throughput for that month. */
export function computeMonthlyGapThroughput(plannedThroughput: number, actualThroughput: number): number {
  return (Number(actualThroughput) || 0) - (Number(plannedThroughput) || 0);
}

/** Cumulative gap vs planned monthly throughput through elapsed months. */
export function computeTotalMonthlyThroughputGap(
  plannedThroughput: number,
  monthCount: number,
  totalActualThroughput: number,
): number {
  return (Number(totalActualThroughput) || 0) - (Number(plannedThroughput) || 0) * monthCount;
}

/** Months from start date through the current month (inclusive). */
export function buildElapsedMonthRange(startDate: string, upToDate: Date = new Date()): string[] {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return [];

  const months: string[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(upToDate.getFullYear(), upToDate.getMonth(), 1);

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
}

export type FsRealizationSortOption =
  | 'projectName_asc'
  | 'huName_asc'
  | 'archetypeName_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'plannedRevenueStartDate_asc'
  | 'plannedRevenueStartDate_desc'
  | 'monthlyRevenuePlan_desc'
  | 'monthlyRevenuePlan_asc';

export type FsRealizationFilterOptions = {
  debouncedSearch: string;
  selectedArchetypes: string[];
  selectedHUs: string[];
  sortBy: FsRealizationSortOption;
};

function matchesSearch(fs: EnrichedFS, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    fs.projectName.toLowerCase().includes(lower) ||
    fs.huName.toLowerCase().includes(lower) ||
    fs.archetypeName.toLowerCase().includes(lower) ||
    fs.capexCategoryName.toLowerCase().includes(lower) ||
    String(fs.fsType || '').toLowerCase().includes(lower) ||
    (fs.plannedRevenueStartDate || '').toLowerCase().includes(lower) ||
    (fs.actualRevenueStartDate || '').toLowerCase().includes(lower)
  );
}

export function filterAndSortFsRealizationList(
  items: EnrichedFS[],
  options: FsRealizationFilterOptions,
): EnrichedFS[] {
  const q = options.debouncedSearch.trim();

  let result = items.filter((fs) => {
    if (
      options.selectedArchetypes.length > 0 &&
      !options.selectedArchetypes.includes(fs.archetypeName)
    ) {
      return false;
    }
    if (options.selectedHUs.length > 0 && !options.selectedHUs.includes(fs.huName)) {
      return false;
    }
    if (!matchesSearch(fs, q)) {
      return false;
    }
    return true;
  });

  result = [...result].sort((a, b) => {
    switch (options.sortBy) {
      case 'huName_asc':
        return a.huName.localeCompare(b.huName) || a.projectName.localeCompare(b.projectName);
      case 'archetypeName_asc':
        return (
          a.archetypeName.localeCompare(b.archetypeName) || a.projectName.localeCompare(b.projectName)
        );
      case 'amount_desc':
        return (b.amount || 0) - (a.amount || 0);
      case 'amount_asc':
        return (a.amount || 0) - (b.amount || 0);
      case 'plannedRevenueStartDate_desc':
        return (b.plannedRevenueStartDate || '').localeCompare(a.plannedRevenueStartDate || '');
      case 'plannedRevenueStartDate_asc':
        return (a.plannedRevenueStartDate || '').localeCompare(b.plannedRevenueStartDate || '');
      case 'monthlyRevenuePlan_desc':
        return (b.monthlyRevenuePlan || 0) - (a.monthlyRevenuePlan || 0);
      case 'monthlyRevenuePlan_asc':
        return (a.monthlyRevenuePlan || 0) - (b.monthlyRevenuePlan || 0);
      case 'projectName_asc':
      default:
        return a.projectName.localeCompare(b.projectName);
    }
  });

  return result;
}

export function collectFilterOptions(items: EnrichedFS[]): {
  archetypes: string[];
  hus: string[];
} {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  items.forEach((fs) => {
    archetypes.add(fs.archetypeName);
    hus.add(fs.huName);
  });
  return {
    archetypes: [...archetypes].sort((a, b) => a.localeCompare(b)),
    hus: [...hus].sort((a, b) => a.localeCompare(b)),
  };
}

export function filterEnrichedFsList(items: EnrichedFS[], debouncedSearch: string): EnrichedFS[] {
  return filterAndSortFsRealizationList(items, {
    debouncedSearch,
    selectedArchetypes: [],
    selectedHUs: [],
    sortBy: 'projectName_asc',
  });
}
