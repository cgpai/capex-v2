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
