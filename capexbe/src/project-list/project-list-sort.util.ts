export type ProjectListSortBy = 'assetCode_asc' | 'assetCode_desc';

export const DEFAULT_PROJECT_LIST_SORT: ProjectListSortBy = 'assetCode_asc';

const VALID_SORT: ProjectListSortBy[] = ['assetCode_asc', 'assetCode_desc'];

export function parseProjectListSortBy(raw: unknown): ProjectListSortBy {
  const value = String(raw ?? '').trim();
  if (VALID_SORT.includes(value as ProjectListSortBy)) {
    return value as ProjectListSortBy;
  }
  return DEFAULT_PROJECT_LIST_SORT;
}

export function isAssetCodeSortAscending(sortBy: ProjectListSortBy): boolean {
  return sortBy !== 'assetCode_desc';
}

export function compareAssetCodes(a: string | undefined | null, b: string | undefined | null): number {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' });
}

export function sortRowsByAssetCode<T extends { asset_code?: string | null; assetCode?: string | null }>(
  rows: T[],
  ascending: boolean,
): T[] {
  return [...rows].sort((a, b) => {
    const cmp = compareAssetCodes(a.asset_code ?? a.assetCode, b.asset_code ?? b.assetCode);
    return ascending ? cmp : -cmp;
  });
}
