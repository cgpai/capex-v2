import type { Asset, AssetTypeConfig } from '@/types';

/** Opsi type untuk form operasional: aktif + type terpilih (meski sudah di-hide di master). */
export function listOperationalAssetTypes(
  all: AssetTypeConfig[],
  selectedAsset?: Pick<Asset, 'assetTypeId' | 'workflowSetId'> | null,
): AssetTypeConfig[] {
  const byId = new Map<string, AssetTypeConfig>();
  for (const at of all) {
    if (at.isActive !== false) byId.set(at.id, at);
  }

  const selectedId = selectedAsset?.assetTypeId != null ? String(selectedAsset.assetTypeId).trim() : '';
  if (selectedId && !byId.has(selectedId)) {
    const current = all.find((at) => at.id === selectedId);
    if (current) byId.set(current.id, current);
  }

  if (!selectedId && selectedAsset?.workflowSetId) {
    const legacy = all.find((at) => at.workflowSetId === selectedAsset.workflowSetId);
    if (legacy && !byId.has(legacy.id)) byId.set(legacy.id, legacy);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
}
