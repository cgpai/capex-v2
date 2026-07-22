import type { EnrichedAsset } from '@/types';
import { savePoAssetsViaBackend, type PoAssetSavePatch } from '@/services/poUpdateApi';
import { saveGrAssetsViaBackend, type GrAssetSavePatch } from '@/services/grUpdateApi';

function toAssetPatch(asset: EnrichedAsset): PoAssetSavePatch {
  return {
    id: String(asset.id),
    projectId: String(asset.projectId),
    poNumber: asset.poNumber ?? null,
    cprId: asset.cprId ?? null,
    poDate: asset.poDate ?? null,
    consumedBudget: asset.consumedBudget,
    isGoodsReceived: asset.isGoodsReceived,
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    description: asset.description,
    budgetPlan: asset.budgetPlan,
    budgetAllocated: asset.budgetAllocated,
    workflowSetId: asset.workflowSetId,
    budgetCategoryId: asset.budgetCategoryId,
    endTargetDate: asset.endTargetDate ?? null,
    catalogueId: asset.catalogueId ?? null,
    bddPriority: asset.bddPriority ?? null,
    assetTypeId: asset.assetTypeId ?? null,
    qty: asset.qty,
    receivedQty: asset.receivedQty,
    lifecycleStatus: asset.lifecycleStatus ?? null,
  };
}

export async function savePoChangedAssetsViaBackend(
  userId: number,
  changedAssets: EnrichedAsset[],
): Promise<boolean> {
  const result = await savePoAssetsViaBackend(userId, changedAssets.map(toAssetPatch));
  return result.ok;
}

export async function saveGrChangedAssetsViaBackend(
  userId: number,
  changedAssets: EnrichedAsset[],
): Promise<boolean> {
  return saveGrAssetsViaBackend(userId, changedAssets.map(toAssetPatch) as GrAssetSavePatch[]);
}
