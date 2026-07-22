import type { EnrichedFS } from '../../hooks/queries/fetchFsApprovalPageData';

export type FsApprovalSortOption =
  | 'projectName_asc'
  | 'paybackPeriod_asc'
  | 'paybackPeriod_desc'
  | 'amount_desc'
  | 'amount_asc';

export type FsApprovalFilterOptions = {
  debouncedSearch: string;
  selectedArchetypes: string[];
  selectedHUs: string[];
  selectedCategories: string[];
  paybackMin?: number;
  paybackMax?: number;
  sortBy: FsApprovalSortOption;
};

function parsePayback(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function matchesSearch(fs: EnrichedFS, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const numericOnly = /^\d+$/.test(q.trim());
  if (numericOnly) {
    const num = parseInt(q.trim(), 10);
    if (parsePayback(fs.paybackPeriod) === num) return true;
    if (fs.amount === num) return true;
    if (fs.npv === num) return true;
  }
  return (
    fs.projectName.toLowerCase().includes(lower) ||
    fs.huName.toLowerCase().includes(lower) ||
    fs.archetypeName.toLowerCase().includes(lower) ||
    fs.capexCategoryName.toLowerCase().includes(lower) ||
    String(fs.conclusion).toLowerCase().includes(lower) ||
    String(fs.paybackPeriod).includes(q.trim())
  );
}

function matchesPaybackRange(fs: EnrichedFS, min?: number, max?: number): boolean {
  const payback = parsePayback(fs.paybackPeriod);
  if (min !== undefined && payback < min) return false;
  if (max !== undefined && payback > max) return false;
  return true;
}

export function filterAndSortFsApprovalList(
  items: EnrichedFS[],
  options: FsApprovalFilterOptions,
): EnrichedFS[] {
  const q = options.debouncedSearch.trim();

  let result = items.filter((fs) => {
    if (options.selectedArchetypes.length > 0 && !options.selectedArchetypes.includes(fs.archetypeName)) {
      return false;
    }
    if (options.selectedHUs.length > 0 && !options.selectedHUs.includes(fs.huName)) {
      return false;
    }
    if (options.selectedCategories.length > 0 && !options.selectedCategories.includes(fs.capexCategoryName)) {
      return false;
    }
    if (!matchesPaybackRange(fs, options.paybackMin, options.paybackMax)) {
      return false;
    }
    if (!matchesSearch(fs, q)) {
      return false;
    }
    return true;
  });

  result = [...result].sort((a, b) => {
    switch (options.sortBy) {
      case 'paybackPeriod_asc':
        return parsePayback(a.paybackPeriod) - parsePayback(b.paybackPeriod);
      case 'paybackPeriod_desc':
        return parsePayback(b.paybackPeriod) - parsePayback(a.paybackPeriod);
      case 'amount_desc':
        return (b.amount || 0) - (a.amount || 0);
      case 'amount_asc':
        return (a.amount || 0) - (b.amount || 0);
      case 'projectName_asc':
      default:
        return a.projectName.localeCompare(b.projectName);
    }
  });

  return result;
}

/** @deprecated Use filterAndSortFsApprovalList */
export function filterEnrichedFsList(items: EnrichedFS[], debouncedSearch: string): EnrichedFS[] {
  return filterAndSortFsApprovalList(items, {
    debouncedSearch,
    selectedArchetypes: [],
    selectedHUs: [],
    selectedCategories: [],
    paybackMin: undefined,
    paybackMax: undefined,
    sortBy: 'projectName_asc',
  });
}

export function diffChangedFsRecords(original: EnrichedFS[], edited: EnrichedFS[]): EnrichedFS[] {
  const originalMap = new Map(original.map((p) => [p.id, p]));
  return edited.filter((row) => {
    const orig = originalMap.get(row.id);
    if (!orig) return true;
    return (
      orig.conclusion !== row.conclusion ||
      (orig.followUpAction || '') !== (row.followUpAction || '')
    );
  });
}

export function mergePaginatedFsEdits(
  fullList: EnrichedFS[],
  pageChanges: EnrichedFS[],
): EnrichedFS[] {
  const changesMap = new Map(pageChanges.map((item) => [item.id, item]));
  return fullList.map((item) => (changesMap.has(item.id) ? changesMap.get(item.id)! : item));
}

export function collectFilterOptions(items: EnrichedFS[]): {
  archetypes: string[];
  hus: string[];
  categories: string[];
} {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  const categories = new Set<string>();
  items.forEach((fs) => {
    archetypes.add(fs.archetypeName);
    hus.add(fs.huName);
    categories.add(fs.capexCategoryName);
  });
  return {
    archetypes: [...archetypes].sort((a, b) => a.localeCompare(b)),
    hus: [...hus].sort((a, b) => a.localeCompare(b)),
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
  };
}
