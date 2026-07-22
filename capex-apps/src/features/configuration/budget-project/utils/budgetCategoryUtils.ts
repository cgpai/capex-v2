import type { BudgetCategoryConfig } from '@/types';
import { generateConfigEntityId } from '@/features/configuration/shared/utils/configIdGenerators';
import { requireName } from '@/features/configuration/shared/utils/configEntityValidation';

export function buildBudgetCategoryPayload(
  draft: Partial<BudgetCategoryConfig>,
): BudgetCategoryConfig | null {
  const name = requireName(draft.name);
  if (!name) return null;
  return {
    id: draft.id ?? generateConfigEntityId('cat', name),
    name,
    isActive: draft.isActive !== undefined ? draft.isActive : true,
  };
}
