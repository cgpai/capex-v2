import type { ProjectPriorityConfig } from '@/types';
import { generateConfigEntityId } from '@/features/configuration/shared/utils/configIdGenerators';
import { requireName } from '@/features/configuration/shared/utils/configEntityValidation';

export function buildProjectPriorityPayload(
  draft: Partial<ProjectPriorityConfig>,
): ProjectPriorityConfig | null {
  const name = requireName(draft.name);
  if (!name) return null;
  return {
    id: draft.id ?? generateConfigEntityId('prio', name),
    name,
    isActive: draft.isActive !== undefined ? draft.isActive : true,
  };
}
