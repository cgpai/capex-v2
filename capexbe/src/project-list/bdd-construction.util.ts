import { postgrestOrIlikeFilterValue } from '../shared/postgrest-filter.util';

export function normalizeBdd(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isBddConstructionAsset(asset: {
  assetTypeGroupName?: string | null;
  assetName?: string | null;
  projectName?: string | null;
}): boolean {
  const group = normalizeBdd(asset.assetTypeGroupName);
  const assetName = normalizeBdd(asset.assetName);
  const projectName = normalizeBdd(asset.projectName);
  return (
    group === 'infrastructure' ||
    group === 'construction' ||
    assetName.includes('construction') ||
    assetName.includes('infrastructure') ||
    assetName.includes('infrastruktur') ||
    assetName.includes('renovasi') ||
    projectName.includes('construction') ||
    projectName.includes('infrastructure') ||
    projectName.includes('infrastruktur') ||
    projectName.includes('renovasi')
  );
}

export function isUnassignedBddPriority(priority: unknown): boolean {
  const p = normalizeBdd(priority);
  return !p || p === 'unassigned';
}

/** Asset type ids whose group is Infrastructure or Construction (SQL prefilter). */
export function resolveBddConstructionAssetTypeIds(groupNameByTypeId: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const [typeId, groupName] of groupNameByTypeId) {
    const g = normalizeBdd(groupName);
    if (g === 'infrastructure' || g === 'construction') {
      ids.push(typeId);
    }
  }
  return ids;
}

const BDD_NAME_TERMS = ['construction', 'infrastructure', 'infrastruktur', 'renovasi'] as const;

/** PostgREST `.or()` — type group + asset_name keywords (project name still filtered in-memory). */
export function buildBddAssetSqlOrFilter(bddTypeIds: string[]): string | null {
  const parts: string[] = [];
  if (bddTypeIds.length > 0) {
    parts.push(`asset_type_id.in.(${bddTypeIds.join(',')})`);
  }
  for (const term of BDD_NAME_TERMS) {
    const v = postgrestOrIlikeFilterValue(term);
    parts.push(`asset_name.ilike.${v}`);
  }
  return parts.length > 0 ? parts.join(',') : null;
}
