'use client';

import React from 'react';
import type { ProjectPriorityConfig } from '@/types';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { BudgetCategoryManagement } from '@/features/configuration/budget-project/components/BudgetCategoryManagement';
import { ProjectPriorityManagement } from '@/features/configuration/budget-project/components/ProjectPriorityManagement';
import { AssetTagManagement } from '@/features/configuration/budget-project/components/AssetTagManagement';
import { BudgetingRules } from '@/features/configuration/budget-project/components/BudgetingRules';

type BudgetProjectTabProps = {
  pack: Partial<ConfigurationDataPack>;
  refreshBudgetCategories: () => void;
  patchProjectPriorities: (priorities: ProjectPriorityConfig[]) => void;
  refreshAssetTags: () => void;
  refreshBudgetingRules: () => void;
};

export function BudgetProjectTab({
  pack,
  refreshBudgetCategories,
  patchProjectPriorities,
  refreshAssetTags,
  refreshBudgetingRules,
}: BudgetProjectTabProps) {
  return (
    <div className="space-y-8">
      <BudgetCategoryManagement
        categories={pack.budgetCategories ?? []}
        onConfigChange={refreshBudgetCategories}
      />
      <ProjectPriorityManagement
        priorities={pack.projectPriorities ?? []}
        onPrioritiesPatched={patchProjectPriorities}
      />
      <AssetTagManagement tags={pack.assetTags ?? []} onConfigChange={refreshAssetTags} />
      <BudgetingRules onConfigChange={refreshBudgetingRules} />
    </div>
  );
}
