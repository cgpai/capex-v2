'use client';

import React, { Suspense, lazy } from 'react';
import type { User, BudgetPeriod } from '@/types';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { ConfigurationTabSkeleton } from '@/features/configuration/core/ConfigurationPageShell';
import { DataManagement } from '@/features/configuration/data-management/components/DataManagement';

const DatabaseInspector = lazy(() =>
  import('@/components/organisms/DatabaseInspector/DatabaseInspector').then((m) => ({
    default: m.DatabaseInspector,
  })),
);

const LazyTabFallback = () => <ConfigurationTabSkeleton rows={4} />;

type DataManagementTabProps = {
  pack: Partial<ConfigurationDataPack>;
  currentUser: User;
  refreshAllPeriods: () => void;
};

export function DataManagementTab({ pack, currentUser, refreshAllPeriods }: DataManagementTabProps) {
  return (
    <DataManagement
      allPeriods={(pack.allPeriods ?? []) as BudgetPeriod[]}
      onDataChange={refreshAllPeriods}
      currentUser={currentUser}
    />
  );
}

export function DatabaseInspectorTab() {
  return (
    <Suspense fallback={<LazyTabFallback />}>
      <DatabaseInspector />
    </Suspense>
  );
}
