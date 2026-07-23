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
  ExecutiveDashboardFilterLoadingBanner,
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
    showMetricsSkeleton,
    isRefreshing,
    errorMessage,
    hasPeriod,
    hasNoDashboardData,
    filtersKey,
  } = useExecutiveDashboard({
    periodName,
    userId: currentUser.id,
    selectedArchetypeId,
  });

  const analysisMount = useWhenVisible();
  const alertsMount = useWhenVisible();

  if (!hasPeriod) return <ExecutiveSummarySelectPeriod />;
  if (errorMessage) return <ExecutiveSummaryError message={errorMessage} />;

  const showEmpty = !showMetricsSkeleton && hasNoDashboardData;

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
        isMetricsLoading={showMetricsSkeleton}
      />

      {showEmpty && <ExecutiveSummaryEmptyPeriod />}

      <div className="space-y-8">
        {showMetricsSkeleton ? <ExecutiveDashboardFilterLoadingBanner /> : null}

        {showMetricsSkeleton ? (
          <ExecutiveDashboardKpiSkeleton />
        ) : (
          <SectionReveal delayMs={0}>
            <section key={`kpi-${filtersKey}`} aria-label="Ringkasan KPI">
              <ExecutiveDashboardKpiRow metrics={metrics} />
            </section>
          </SectionReveal>
        )}

        {showMetricsSkeleton ? (
          <ExecutiveDashboardChartsRowSkeleton />
        ) : (
          <SectionReveal delayMs={60}>
            <section
              key={`charts-${filtersKey}`}
              aria-label="Grafik utama"
              className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch"
            >
              <ExecutiveDashboardTrendChart data={metrics.monthlyTrend} />
              <ExecutiveDashboardUnitBarChart units={metrics.budgetByUnit} />
              <ExecutiveDashboardCapexStatusChart status={metrics.capexStatus} />
            </section>
          </SectionReveal>
        )}

        <div ref={analysisMount.ref}>
          {showMetricsSkeleton || !analysisMount.visible ? (
            <ExecutiveDashboardAnalysisSkeleton />
          ) : (
            <SectionReveal delayMs={120}>
              <section key={`analysis-${filtersKey}`} aria-label="Analisis detail">
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
          {showMetricsSkeleton || !alertsMount.visible ? (
            <ExecutiveDashboardAlertsSkeleton />
          ) : (
            <SectionReveal delayMs={180}>
              <section key={`alerts-${filtersKey}`} aria-label="Peringatan">
                <ExecutiveDashboardAlerts alerts={metrics.alerts} />
              </section>
            </SectionReveal>
          )}
        </div>
      </div>

      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-siloam-border text-xs font-bold text-siloam-text-secondary">
        <span className="uppercase tracking-widest" style={{ color: EXECUTIVE_SUMMARY_COLORS.header }}>
          Executive Dashboard · {periodHeader?.periodName ?? periodName}
        </span>
        {!showMetricsSkeleton ? <span>Terakhir diperbarui: {updatedLabel}</span> : null}
      </footer>
    </div>
  );
});
