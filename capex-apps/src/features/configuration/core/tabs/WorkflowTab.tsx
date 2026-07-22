'use client';

import React from 'react';
import type { User } from '@/types';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import type { AssetTypeMasterPatch } from '@/components/organisms/AssetTypeManagement/AssetTypeManagement';
import { WorkflowManagement } from '@/features/configuration/workflow/components/WorkflowManagement';

type WorkflowTabProps = {
  pack: Partial<ConfigurationDataPack>;
  currentUser: User;
  refreshWorkflowTasks: () => void;
  onAssetTypesPatched: (patch: AssetTypeMasterPatch) => void;
};

export function WorkflowTab({
  pack,
  currentUser,
  refreshWorkflowTasks,
  onAssetTypesPatched,
}: WorkflowTabProps) {
  return (
    <div className="space-y-8">
      <WorkflowManagement
        tasks={pack.tasks ?? []}
        workflows={pack.workflows ?? []}
        roles={pack.roles ?? []}
        assetTypes={pack.assetTypeConfigs ?? []}
        assetTypeGroups={pack.assetTypeGroups ?? []}
        onWorkflowConfigChange={refreshWorkflowTasks}
        onAssetTypesPatched={onAssetTypesPatched}
        currentUser={currentUser}
      />
    </div>
  );
}
