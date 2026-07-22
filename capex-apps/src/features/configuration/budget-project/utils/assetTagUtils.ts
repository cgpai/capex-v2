import type { AssetTagConfig } from '@/types';
import { generateConfigEntityId } from '@/features/configuration/shared/utils/configIdGenerators';
import { requireName } from '@/features/configuration/shared/utils/configEntityValidation';

export const ASSET_TAG_COLOR_OPTIONS = [
  { label: 'Gray', value: 'bg-gray-100 text-gray-800' },
  { label: 'Red', value: 'bg-red-100 text-red-800' },
  { label: 'Orange', value: 'bg-orange-100 text-orange-800' },
  { label: 'Yellow', value: 'bg-yellow-100 text-yellow-800' },
  { label: 'Green', value: 'bg-siloam-green/10 text-siloam-green' },
  { label: 'Blue', value: 'bg-siloam-blue/10 text-siloam-blue' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-800' },
] as const;

export const DEFAULT_ASSET_TAG_COLOR = 'bg-gray-100 text-gray-800';

export function buildAssetTagPayload(draft: Partial<AssetTagConfig>): AssetTagConfig | null {
  const name = requireName(draft.name);
  if (!name) return null;
  return {
    id: draft.id ?? generateConfigEntityId('tag', name),
    name,
    color: draft.color || DEFAULT_ASSET_TAG_COLOR,
  };
}
