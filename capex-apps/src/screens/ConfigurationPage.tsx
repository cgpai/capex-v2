'use client';

import React, { useEffect, useCallback, memo, useMemo, useRef } from 'react';
import type { User, UserRole, ProjectPriorityConfig } from '@/types';
import type { ConfigSliceKey } from '@/services/configurationApi';
import { useToast } from '@/contexts/ToastContext';
import { useConfigurationPageData } from '@/features/configuration/core/useConfigurationPageData';
import {
  CONFIGURATION_TABS,
  isConfigurationTabReady,
} from '@/features/configuration/core/configurationPageUtils';
import {
  ConfigurationPageShell,
  ConfigurationTabSkeleton,
  ConfigurationTabLoadError,
} from '@/features/configuration/core/ConfigurationPageShell';
import { ConfigurationTabPanels } from '@/features/configuration/core/ConfigurationTabPanels';
import { useConfigurationTab } from '@/features/configuration/core/useConfigurationTab';

export interface ConfigurationPageProps {
  onConfigurationChange: () => void;
  onUsersListPatch?: (users: User[]) => void;
  onRolesListPatch?: (roles: UserRole[]) => void;
  currentUser: User;
}

export const ConfigurationPage = memo(function ConfigurationPage({
  onConfigurationChange,
  onUsersListPatch,
  onRolesListPatch,
  currentUser,
}: ConfigurationPageProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useConfigurationTab();
  const configErrorToastShownRef = useRef(false);

  const {
    pack: allData,
    partialPack,
    configQuery,
    canRenderShell,
    isInitialLoading,
    isRevalidating,
    refreshSlices,
    prefetchTab,
    patchUsersList: patchUsersInCache,
    patchRolesList: patchRolesInCache,
    patchConfigurationSlices,
    activeTabLoadStatus,
    retryActiveTab,
  } = useConfigurationPageData({ userId: currentUser.id, activeTab });

  useEffect(() => {
    if (!configQuery.isError) {
      configErrorToastShownRef.current = false;
      return;
    }
    if (canRenderShell || configErrorToastShownRef.current) return;
    configErrorToastShownRef.current = true;
    showToast('Gagal memuat konfigurasi.', 'error');
  }, [configQuery.isError, canRenderShell, showToast]);

  const patchUsersList = useCallback(
    (nextUsers: User[]) => {
      patchUsersInCache(nextUsers);
      onUsersListPatch?.(nextUsers);
    },
    [onUsersListPatch, patchUsersInCache],
  );

  const patchRolesList = useCallback(
    (nextRoles: UserRole[]) => {
      patchRolesInCache(nextRoles);
      onRolesListPatch?.(nextRoles);
    },
    [onRolesListPatch, patchRolesInCache],
  );

  const patchAssetTypeMaster = useCallback(
    (patch: Parameters<typeof patchConfigurationSlices>[0]) => {
      patchConfigurationSlices(patch);
    },
    [patchConfigurationSlices],
  );

  const patchProjectPriorities = useCallback(
    (priorities: ProjectPriorityConfig[]) => {
      patchConfigurationSlices({ projectPriorities: priorities });
    },
    [patchConfigurationSlices],
  );

  const refreshThenNotifyApp = useCallback(
    async (slices: ConfigSliceKey[]) => {
      await refreshSlices(slices);
      onConfigurationChange();
    },
    [onConfigurationChange, refreshSlices],
  );

  const refreshOnly = useCallback(
    (slices: ConfigSliceKey[]) => {
      void refreshSlices(slices);
    },
    [refreshSlices],
  );

  const tabReady = isConfigurationTabReady(partialPack, activeTab);

  const handleTabChange = useCallback(
    (tab: string) => setActiveTab(tab as typeof activeTab),
    [setActiveTab],
  );

  const handleRetryActiveTab = useCallback(() => {
    void retryActiveTab();
  }, [retryActiveTab]);

  const shellProps = useMemo(
    () => ({
      activeTab,
      tabs: CONFIGURATION_TABS,
      onTabChange: handleTabChange,
      onTabHover: prefetchTab,
      isRevalidating: !isInitialLoading && canRenderShell ? isRevalidating : undefined,
    }),
    [activeTab, handleTabChange, prefetchTab, isInitialLoading, canRenderShell, isRevalidating],
  );

  const tabContent = useMemo(() => {
    if (activeTabLoadStatus === 'error') {
      return <ConfigurationTabLoadError onRetry={handleRetryActiveTab} />;
    }
    if (!tabReady) {
      return <ConfigurationTabSkeleton />;
    }
    return (
      <ConfigurationTabPanels
        activeTab={activeTab}
        pack={allData}
        currentUser={currentUser}
        patchUsersList={patchUsersList}
        patchRolesList={patchRolesList}
        patchAssetTypeMaster={patchAssetTypeMaster}
        patchProjectPriorities={patchProjectPriorities}
        refreshOnly={refreshOnly}
        refreshThenNotifyApp={refreshThenNotifyApp}
      />
    );
  }, [
    activeTabLoadStatus,
    handleRetryActiveTab,
    tabReady,
    activeTab,
    allData,
    currentUser,
    patchUsersList,
    patchRolesList,
    patchAssetTypeMaster,
    patchProjectPriorities,
    refreshOnly,
    refreshThenNotifyApp,
  ]);

  if (isInitialLoading || !canRenderShell) {
    return (
      <ConfigurationPageShell {...shellProps}>
        <ConfigurationTabSkeleton />
      </ConfigurationPageShell>
    );
  }

  return <ConfigurationPageShell {...shellProps}>{tabContent}</ConfigurationPageShell>;
});
