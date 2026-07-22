import type { AssetTypeConfig, AssetTypeGroupConfig } from '@/types';
import { generateConfigEntityId } from '@/features/configuration/shared/utils/configIdGenerators';
import { requireName } from '@/features/configuration/shared/utils/configEntityValidation';

export function buildAssetTypeGroupPayload(
  draft: Partial<AssetTypeGroupConfig>,
): AssetTypeGroupConfig | null {
  const name = requireName(draft.name);
  if (!name) return null;
  return {
    id: draft.id ?? generateConfigEntityId('atg', name),
    name,
  };
}

export function buildAssetTypePayload(
  draft: Partial<AssetTypeConfig>,
): AssetTypeConfig | null {
  const name = requireName(draft.name);
  const workflowSetId = String(draft.workflowSetId ?? '').trim();
  if (!name || !workflowSetId) return null;
  return {
    id: draft.id ?? generateConfigEntityId('at', name),
    name,
    workflowSetId,
    isActive: draft.isActive !== undefined ? draft.isActive : true,
    groupId: draft.groupId || undefined,
  };
}
