import React, { memo } from 'react';
import type { Archetype, User } from '../types';
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard';
import { ExecutiveDashboardHeader } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardHeader';
import { ExecutiveDashboardKpiRow } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardKpiRow';
import { ExecutiveDashboardTrendChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardTrendChart';
import { ExecutiveDashboardUnitBarChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardUnitBarChart';
import { ExecutiveDashboardCapexStatusChart } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardCapexStatusChart';
import { ExecutiveDashboardAnalysisSection } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardAnalysisSection';
import { ExecutiveDashboardAlerts } from '../components/organisms/ExecutiveSummary/ExecutiveDashboardAlerts';
import {
  ExecutiveSummaryEmptyPeriod,
  ExecutiveSummaryError,
  ExecutiveSummaryLoading,
  ExecutiveSummarySelectPeriod,
} from '../components/organisms/ExecutiveSummary/ExecutiveSummaryPageStates';
import { EXECUTIVE_SUMMARY_COLORS } from '../lib/executiveSummary/constants';

export interface ExecutiveSummaryPageProps {
  periodName: string;
  currentUser: User;
  selectedArchetypeId?: string | null;
  onArchetypeChange?: (id: string) => void;
  visibleArchetypes?: Archetype[];
}

export const ExecutiveSummaryPage = memo(function ExecutiveSummaryPage({
  periodName,
  currentUser,
  selectedArchetypeId = null,
  onArchetypeChange,
  visibleArchetypes,
}: ExecutiveSummaryPageProps) {
  const {
    periodHeader,
    metrics,
    isLoading,
    isRefreshing,
    errorMessage,
    hasPeriod,
    hasNoDashboardData,
  } = useExecutiveDashboard({
    periodName,
    userId: currentUser.id,
    selectedArchetypeId,
  });

  if (!hasPeriod) return <ExecutiveSummarySelectPeriod />;
  if (isLoading) return <ExecutiveSummaryLoading />;
  if (errorMessage) return <ExecutiveSummaryError message={errorMessage} />;

  const updatedLabel = metrics.updatedAt
    ? new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(metrics.updatedAt))
    : '—';

  return (
    <div className="flex-1 space-y-6 animate-fade-in pb-6">
      <ExecutiveDashboardHeader
        period={periodHeader}
        visibleArchetypes={visibleArchetypes}
        selectedArchetypeId={selectedArchetypeId}
        onArchetypeChange={onArchetypeChange}
        isRefreshing={isRefreshing}
      />

      {hasNoDashboardData && <ExecutiveSummaryEmptyPeriod />}

      <ExecutiveDashboardKpiRow metrics={metrics} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <ExecutiveDashboardTrendChart data={metrics.monthlyTrend} />
        </div>
        <div className="xl:col-span-1">
          <ExecutiveDashboardUnitBarChart units={metrics.budgetByUnit} />
        </div>
        <div className="xl:col-span-1">
          <ExecutiveDashboardCapexStatusChart status={metrics.capexStatus} />
        </div>
      </div>

      <ExecutiveDashboardAnalysisSection
        categories={metrics.categoryBreakdown}
        topInvestments={metrics.topInvestments}
        topUnits={metrics.topUnits}
      />

      <ExecutiveDashboardAlerts alerts={metrics.alerts} />

      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-siloam-border text-xs font-bold text-siloam-text-secondary">
        <span className="uppercase tracking-widest" style={{ color: EXECUTIVE_SUMMARY_COLORS.header }}>
          Executive Dashboard · {periodHeader?.periodName ?? periodName}
        </span>
        <span>Terakhir diperbarui: {updatedLabel}</span>
      </footer>
    </div>
  );
});
