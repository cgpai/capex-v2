import type { Asset, AssetTypeConfig } from '../types';

export function activeAssetTypeOptions(allAssetTypes: AssetTypeConfig[]) {
  return allAssetTypes
    .filter((at) => at.isActive)
    .map((at) => ({ value: at.id, label: at.name }));
}

export function resolveAssetTypeId(asset: Asset, allAssetTypes: AssetTypeConfig[]): string {
  if (asset.assetTypeId) {
    return asset.assetTypeId;
  }
  const byWorkflow = allAssetTypes.find((at) => at.workflowSetId === asset.workflowSetId);
  return byWorkflow?.id ?? '';
}

export function applyAssetTypeToAsset(
  asset: Asset,
  assetTypeId: string,
  allAssetTypes: AssetTypeConfig[],
): Asset {
  const selected = allAssetTypes.find((at) => at.id === assetTypeId);
  if (!selected) return asset;
  return {
    ...asset,
    assetTypeId: selected.id,
    workflowSetId: selected.workflowSetId,
  };
}

export function syncAssetsWithSelectedTypes(
  assets: Asset[],
  allAssetTypes: AssetTypeConfig[],
): Asset[] {
  return assets.map((asset) => {
    const typeId = resolveAssetTypeId(asset, allAssetTypes);
    if (!typeId) return asset;
    return applyAssetTypeToAsset(asset, typeId, allAssetTypes);
  });
}

export function defaultRoutineAssetTypeId(
  allAssetTypes: AssetTypeConfig[],
  preferredWorkflowId?: string | null,
): string {
  const active = allAssetTypes.filter((at) => at.isActive);
  if (active.length === 0) return '';
  if (preferredWorkflowId) {
    const match = active.find((at) => at.workflowSetId === preferredWorkflowId);
    if (match) return match.id;
  }
  return active[0].id;
}
