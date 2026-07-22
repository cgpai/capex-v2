'use client';

import React, { memo } from 'react';
import type { User } from '../types';
import { useDashboardPage } from '../hooks/useDashboardPage';
import { DashboardKpiRow } from '../components/organisms/Dashboard/DashboardKpiRow';
import { DashboardChartsSection } from '../components/organisms/Dashboard/DashboardChartsSection';
import {
  DashboardBackendUnavailable,
  DashboardError,
  DashboardSelectPeriod,
} from '../components/organisms/Dashboard/DashboardPageStates';

export interface DashboardPageProps {
  periodName: string;
  currentUser: User;
}

export const DashboardPage: React.FC<DashboardPageProps> = memo(function DashboardPage({
  periodName,
  currentUser,
}) {
  const {
    stats,
    projectCountDisplay,
    errorMessage,
    hasPeriod,
    isRefreshing,
    isBackendEmpty,
  } = useDashboardPage({ periodName, currentUser });

  if (!hasPeriod) return <DashboardSelectPeriod />;
  if (errorMessage) return <DashboardError message={errorMessage} />;
  if (isBackendEmpty) return <DashboardBackendUnavailable />;

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardKpiRow
        totalBudget={stats.totalBudget}
        totalConsumed={stats.totalConsumed}
        projectCountDisplay={projectCountDisplay}
        isRefreshing={isRefreshing}
      />
      <DashboardChartsSection
        projectStatusData={stats.projectStatusData}
        budgetByCategory={stats.budgetByCategory}
        sankeyData={stats.sankeyData}
      />
    </div>
  );
});

DashboardPage.displayName = 'DashboardPage';
