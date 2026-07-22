'use client';

import React, { useCallback } from 'react';
import type { User, UserRole } from '@/types';
import type { ConfigSliceKey, ConfigurationDataPack } from '@/services/configurationApi';
import type { ConfigurationTab } from '@/features/configuration/core/configurationPageUtils';
import type { AssetTypeMasterPatch } from '@/components/organisms/AssetTypeManagement/AssetTypeManagement';
import type { ProjectPriorityConfig } from '@/types';
import { UsersRolesTab } from './tabs/UsersRolesTab';
import { MasterDataTab } from './tabs/MasterDataTab';
import { BudgetProjectTab } from './tabs/BudgetProjectTab';
import { WorkflowTab } from './tabs/WorkflowTab';
import { PipelineTab } from './tabs/PipelineTab';
import { DataManagementTab, DatabaseInspectorTab } from './tabs/DataManagementTab';
import { invalidateRequestCache } from '@/lib/requestCache';
import { invalidateBudgetHuConfigDiskCache } from '@/lib/budgetHuDiskCache';

export type ConfigurationTabPanelsProps = {
  activeTab: ConfigurationTab;
  pack: Partial<ConfigurationDataPack>;
  currentUser: User;
  patchUsersList: (users: User[]) => void;
  patchRolesList: (roles: UserRole[]) => void;
  patchAssetTypeMaster: (patch: AssetTypeMasterPatch) => void;
  patchProjectPriorities: (priorities: ProjectPriorityConfig[]) => void;
  refreshOnly: (slices: ConfigSliceKey[]) => void;
  refreshThenNotifyApp: (slices: ConfigSliceKey[]) => Promise<void>;
};

export function ConfigurationTabPanels({
  activeTab,
  pack,
  currentUser,
  patchUsersList,
  patchRolesList,
  patchAssetTypeMaster,
  patchProjectPriorities,
  refreshOnly,
  refreshThenNotifyApp,
}: ConfigurationTabPanelsProps) {
  const refreshMasterCatalogue = useCallback(() => refreshOnly(['masterCatalogue']), [refreshOnly]);
  const refreshRooms = useCallback(() => refreshOnly(['rooms']), [refreshOnly]);
  const refreshVendors = useCallback(() => refreshOnly(['vendors']), [refreshOnly]);
  const refreshBudgetCategories = useCallback(() => refreshOnly(['budgetCategories']), [refreshOnly]);
  const refreshAssetTags = useCallback(() => refreshOnly(['assetTags']), [refreshOnly]);
  const refreshBudgetingRules = useCallback(() => {
    invalidateRequestCache('app:master:budget-hu:');
    invalidateRequestCache('app:table:budget-hu:');
    invalidateBudgetHuConfigDiskCache(currentUser.id);
  }, [currentUser.id]);
  const refreshMasterData = useCallback(
    () => refreshOnly(['archetypes', 'hospitalUnits', 'regionals']),
    [refreshOnly],
  );
  const refreshWorkflowTasks = useCallback(
    () => refreshOnly(['tasks', 'workflows']),
    [refreshOnly],
  );
  const refreshAllPeriods = useCallback(() => refreshOnly(['allPeriods']), [refreshOnly]);

  if (activeTab === 'Users & Roles') {
    return (
      <UsersRolesTab
        pack={pack}
        currentUser={currentUser}
        patchUsersList={patchUsersList}
        patchRolesList={patchRolesList}
      />
    );
  }

  if (activeTab === 'Master Data') {
    return <MasterDataTab pack={pack} refreshMasterData={refreshMasterData} />;
  }

  if (activeTab === 'Budget & Project') {
    return (
      <BudgetProjectTab
        pack={pack}
        refreshBudgetCategories={refreshBudgetCategories}
        patchProjectPriorities={patchProjectPriorities}
        refreshAssetTags={refreshAssetTags}
        refreshBudgetingRules={refreshBudgetingRules}
      />
    );
  }

  if (activeTab === 'Workflow') {
    return (
      <WorkflowTab
        pack={pack}
        currentUser={currentUser}
        refreshWorkflowTasks={refreshWorkflowTasks}
        onAssetTypesPatched={patchAssetTypeMaster}
      />
    );
  }

  if (activeTab === 'Pipeline & Vendors') {
    return (
      <PipelineTab
        pack={pack}
        refreshMasterCatalogue={refreshMasterCatalogue}
        refreshRooms={refreshRooms}
        refreshVendors={refreshVendors}
      />
    );
  }

  if (activeTab === 'Data Management') {
    return (
      <DataManagementTab pack={pack} currentUser={currentUser} refreshAllPeriods={refreshAllPeriods} />
    );
  }

  if (activeTab === 'Database Inspector') {
    return <DatabaseInspectorTab />;
  }

  return null;
}
