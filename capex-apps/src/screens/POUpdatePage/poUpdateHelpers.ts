import type { EnrichedAsset, ProjectPriorityConfig } from '../../types';

export type PoSortOption = 'assetName_asc' | 'projectName_asc' | 'consumedBudget_desc';
export type PoStatusFilter = 'all' | 'hasPO' | 'noPO';

export const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const BUDGET_THRESHOLD = 300_000_000;

export type PoFilterMaps = {
  projectPriorityMap: Map<string, string>;
  projectBudgetMap: Map<string, number>;
};

export function buildPoFilterMaps(
  projects: { id: string; priorityId: string; approvedBudget: number; budgetPlan: number }[],
  priorities: ProjectPriorityConfig[],
): PoFilterMaps {
  const priorityIdToNameMap = new Map(priorities.map((p) => [p.id, p.name] as [string, string]));
  const projectPriorityMap = new Map<string, string>();
  const projectBudgetMap = new Map<string, number>();

  projects.forEach((p) => {
    const priorityName = priorityIdToNameMap.get(p.priorityId);
    if (priorityName) projectPriorityMap.set(p.id, priorityName);
    projectBudgetMap.set(p.id, p.approvedBudget > 0 ? p.approvedBudget : p.budgetPlan);
  });

  return { projectPriorityMap, projectBudgetMap };
}

export function filterAndSortPoAssets(
  data: EnrichedAsset[],
  options: {
    poStatusFilter: PoStatusFilter;
    assetHasPOMap: Map<string, boolean>;
    focusNeedingPO: boolean;
    focusNotReceived: boolean;
    debouncedSearch: string;
    selectedHUs: string[];
    selectedPriorities: string[];
    selectedFinishedTasks: string[];
    selectedBudgetFilter: string | null;
    completionRange: { min: number; max: number };
    sortBy: PoSortOption;
    meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
    assetLastTaskMap: Map<string, string>;
    filterMaps: PoFilterMaps;
  },
): EnrichedAsset[] {
  let result = data;

  if (options.poStatusFilter === 'hasPO') {
    result = result.filter((asset) => options.assetHasPOMap.get(asset.id) === true);
  } else if (options.poStatusFilter === 'noPO') {
    result = result.filter((asset) => options.assetHasPOMap.get(asset.id) !== true);
  }

  if (options.focusNeedingPO) {
    result = result.filter(
      (asset) => asset.budgetPlan > 0 && (!asset.poNumber || asset.poNumber.trim() === ''),
    );
  }
  if (options.focusNotReceived) {
    result = result.filter(
      (asset) => (asset.poNumber && asset.poNumber.trim() !== '') && !asset.isGoodsReceived,
    );
  }

  const { projectPriorityMap, projectBudgetMap } = options.filterMaps;
  const lowerSearch = options.debouncedSearch.toLowerCase().trim();

  result = result.filter((asset) => {
    if (
      options.meetingFilters.archetype &&
      normalize(asset.archetypeName) !== normalize(options.meetingFilters.archetype)
    ) {
      return false;
    }
    if (
      options.meetingFilters.assetTypeGroup &&
      normalize(asset.assetTypeGroupName) !== normalize(options.meetingFilters.assetTypeGroup)
    ) {
      return false;
    }
    if (
      options.selectedHUs.length > 0 &&
      !options.selectedHUs.some((hu) => normalize(hu) === normalize(asset.huName))
    ) {
      return false;
    }
    if (options.selectedBudgetFilter) {
      const projectBudget = projectBudgetMap.get(asset.projectId) || 0;
      if (options.selectedBudgetFilter === 'low' && projectBudget > BUDGET_THRESHOLD) return false;
      if (options.selectedBudgetFilter === 'high' && projectBudget <= BUDGET_THRESHOLD) return false;
    }
    if (options.selectedPriorities.length > 0) {
      const priorityName = projectPriorityMap.get(asset.projectId);
      if (!priorityName || !options.selectedPriorities.some((p) => normalize(p) === normalize(priorityName))) {
        return false;
      }
    }
    if (options.selectedFinishedTasks.length > 0) {
      const lastTask = options.assetLastTaskMap.get(asset.id);
      if (!lastTask || !options.selectedFinishedTasks.some((t) => normalize(t) === normalize(lastTask))) {
        return false;
      }
    }
    const completionRate = asset.budgetPlan > 0 ? (asset.consumedBudget / asset.budgetPlan) * 100 : 0;
    if (completionRate < options.completionRange.min || completionRate > options.completionRange.max) {
      return false;
    }
    if (
      lowerSearch &&
      !(
        asset.assetName.toLowerCase().includes(lowerSearch) ||
        asset.assetCode?.toLowerCase().includes(lowerSearch) ||
        asset.projectName.toLowerCase().includes(lowerSearch) ||
        asset.projectCode?.toLowerCase().includes(lowerSearch) ||
        asset.huName.toLowerCase().includes(lowerSearch) ||
        asset.archetypeName.toLowerCase().includes(lowerSearch) ||
        asset.poNumber?.toLowerCase().includes(lowerSearch) ||
        asset.cprId?.toLowerCase().includes(lowerSearch) ||
        asset.poDate?.toLowerCase().includes(lowerSearch)
      )
    ) {
      return false;
    }
    return true;
  });

  return [...result].sort((a, b) => {
    switch (options.sortBy) {
      case 'projectName_asc':
        return a.projectName.localeCompare(b.projectName);
      case 'consumedBudget_desc':
        return b.consumedBudget - a.consumedBudget;
      default:
        return a.assetName.localeCompare(b.assetName);
    }
  });
}

const PO_COMPARE_KEYS = ['cprId', 'poNumber', 'poDate', 'consumedBudget', 'isGoodsReceived'] as const;

export function poDateToTaskCompletedAt(poDate?: string | null): string | undefined {
  const raw = String(poDate ?? '').trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00`).toISOString();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function formatPoDateDisplay(poDate?: string | null): string {
  const raw = String(poDate ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function hasPoFieldChanges(original: EnrichedAsset, edited: EnrichedAsset): boolean {
  return (
    original.poNumber !== edited.poNumber ||
    original.consumedBudget !== edited.consumedBudget ||
    original.cprId !== edited.cprId
  );
}

/** Set Tgl PO to today when PO fields change and date is still empty. */
export function preparePoAssetsForSave(
  original: EnrichedAsset[],
  edited: EnrichedAsset[],
): EnrichedAsset[] {
  const originalMap = new Map(original.map((a) => [a.id, a]));
  const today = new Date().toISOString().slice(0, 10);

  return edited.map((asset) => {
    const orig = originalMap.get(asset.id);
    if (!orig) return asset;
    if (asset.poDate?.trim()) return asset;
    if (!hasPoFieldChanges(orig, asset)) return asset;
    const hasPoData =
      Boolean(asset.poNumber?.trim()) ||
      Boolean(asset.cprId?.trim()) ||
      (asset.consumedBudget ?? 0) > 0 ||
      (asset as EnrichedAsset & { __poSentToVendorChecked?: boolean }).__poSentToVendorChecked === true;
    if (!hasPoData) return asset;
    return { ...asset, poDate: today };
  });
}

export function shouldTriggerPoCreatedTask(
  asset: EnrichedAsset,
  original: EnrichedAsset | undefined,
  alreadyHasPoTask: boolean,
): boolean {
  if (alreadyHasPoTask) return false;
  if ((asset as EnrichedAsset & { __poSentToVendorChecked?: boolean }).__poSentToVendorChecked) {
    return true;
  }
  if (!original) return false;
  if (!hasPoFieldChanges(original, asset)) return false;
  return Boolean(asset.poNumber?.trim()) || (asset.consumedBudget ?? 0) > 0;
}

export function diffChangedPoAssets(original: EnrichedAsset[], edited: EnrichedAsset[]): EnrichedAsset[] {
  const originalMap = new Map(original.map((a) => [a.id, a]));
  return edited.filter((item) => {
    const orig = originalMap.get(item.id);
    if (!orig) return true;
    if ((item as EnrichedAsset & { __poSentToVendorChecked?: boolean }).__poSentToVendorChecked) {
      return true;
    }
    return PO_COMPARE_KEYS.some((key) => item[key] !== orig[key]);
  });
}

export function buildPoChangeSummaryRows(
  original: EnrichedAsset[],
  edited: EnrichedAsset[],
): { item: string; before: string; after: string }[] {
  const originalMap = new Map(original.map((a) => [a.id, a]));
  const changes: { item: string; before: string; after: string }[] = [];

  edited.forEach((editedAsset) => {
    const originalAsset = originalMap.get(editedAsset.id);
    if (!originalAsset) return;
    if (originalAsset.cprId !== editedAsset.cprId) {
      changes.push({
        item: `${editedAsset.assetName} CPR ID`,
        before: originalAsset.cprId || 'N/A',
        after: editedAsset.cprId || 'N/A',
      });
    }
    if (originalAsset.poNumber !== editedAsset.poNumber) {
      changes.push({
        item: `${editedAsset.assetName} PO #`,
        before: originalAsset.poNumber || 'N/A',
        after: editedAsset.poNumber || 'N/A',
      });
    }
    if (originalAsset.poDate !== editedAsset.poDate) {
      changes.push({
        item: `${editedAsset.assetName} Tgl PO`,
        before: formatPoDateDisplay(originalAsset.poDate) || 'N/A',
        after: formatPoDateDisplay(editedAsset.poDate) || 'N/A',
      });
    }
    if (originalAsset.consumedBudget !== editedAsset.consumedBudget) {
      changes.push({
        item: `${editedAsset.assetName} PO Value`,
        before: String(originalAsset.consumedBudget),
        after: String(editedAsset.consumedBudget),
      });
    }
    if (!!originalAsset.isGoodsReceived !== !!editedAsset.isGoodsReceived) {
      changes.push({
        item: `${editedAsset.assetName} GR Status`,
        before: originalAsset.isGoodsReceived ? 'Received' : 'Not Received',
        after: editedAsset.isGoodsReceived ? 'Received' : 'Not Received',
      });
    }
  });

  return changes;
}
