import React, { memo } from 'react';
import type { Archetype, User } from '../types';
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard';
import { useWhenVisible } from '../hooks/useWhenVisible';
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
  ExecutiveSummarySelectPeriod,
} from '../components/organisms/ExecutiveSummary/ExecutiveSummaryPageStates';
import {
  ExecutiveDashboardAlertsSkeleton,
  ExecutiveDashboardAnalysisSkeleton,
  ExecutiveDashboardChartsRowSkeleton,
  ExecutiveDashboardKpiSkeleton,
} from '../components/organisms/ExecutiveSummary/ExecutiveDashboardSkeletons';
import { EXECUTIVE_SUMMARY_COLORS } from '../lib/executiveSummary/constants';

export interface ExecutiveSummaryPageProps {
  periodName: string;
  currentUser: User;
  selectedArchetypeId?: string | null;
  onArchetypeChange?: (id: string) => void;
  visibleArchetypes?: Archetype[];
}

function SectionReveal({
  delayMs,
  children,
}: {
  delayMs: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-fade-in"
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: 'backwards' }}
    >
      {children}
    </div>
  );
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
    isInitialLoad,
    isRefreshing,
    errorMessage,
    hasPeriod,
    hasNoDashboardData,
  } = useExecutiveDashboard({
    periodName,
    userId: currentUser.id,
    selectedArchetypeId,
  });

  const analysisMount = useWhenVisible();
  const alertsMount = useWhenVisible();

  if (!hasPeriod) return <ExecutiveSummarySelectPeriod />;
  if (errorMessage) return <ExecutiveSummaryError message={errorMessage} />;

  const showEmpty = !isInitialLoad && hasNoDashboardData;

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
    <div className="flex-1 space-y-8 pb-6">
      <ExecutiveDashboardHeader
        period={periodHeader}
        visibleArchetypes={visibleArchetypes}
        selectedArchetypeId={selectedArchetypeId}
        onArchetypeChange={onArchetypeChange}
        isRefreshing={isRefreshing}
        isMetricsLoading={isInitialLoad}
      />

      {showEmpty && <ExecutiveSummaryEmptyPeriod />}

      <div className="space-y-8">
        {isInitialLoad ? (
          <ExecutiveDashboardKpiSkeleton />
        ) : (
          <SectionReveal delayMs={0}>
            <section aria-label="Ringkasan KPI">
              <ExecutiveDashboardKpiRow metrics={metrics} />
            </section>
          </SectionReveal>
        )}

        {isInitialLoad ? (
          <ExecutiveDashboardChartsRowSkeleton />
        ) : (
          <SectionReveal delayMs={60}>
            <section aria-label="Grafik utama" className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
              <ExecutiveDashboardTrendChart data={metrics.monthlyTrend} />
              <ExecutiveDashboardUnitBarChart units={metrics.budgetByUnit} />
              <ExecutiveDashboardCapexStatusChart status={metrics.capexStatus} />
            </section>
          </SectionReveal>
        )}

        <div ref={analysisMount.ref}>
          {isInitialLoad || !analysisMount.visible ? (
            <ExecutiveDashboardAnalysisSkeleton />
          ) : (
            <SectionReveal delayMs={120}>
              <section aria-label="Analisis detail">
                <ExecutiveDashboardAnalysisSection
                  categories={metrics.categoryBreakdown}
                  topInvestments={metrics.topInvestments}
                  topUnits={metrics.topUnits}
                />
              </section>
            </SectionReveal>
          )}
        </div>

        <div ref={alertsMount.ref}>
          {isInitialLoad || !alertsMount.visible ? (
            <ExecutiveDashboardAlertsSkeleton />
          ) : (
            <SectionReveal delayMs={180}>
              <ExecutiveDashboardAlerts alerts={metrics.alerts} />
            </SectionReveal>
          )}
        </div>
      </div>

      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-siloam-border text-xs font-bold text-siloam-text-secondary">
        <span className="uppercase tracking-widest" style={{ color: EXECUTIVE_SUMMARY_COLORS.header }}>
          Executive Dashboard · {periodHeader?.periodName ?? periodName}
        </span>
        {!isInitialLoad ? <span>Terakhir diperbarui: {updatedLabel}</span> : null}
      </footer>
    </div>
  );
});
