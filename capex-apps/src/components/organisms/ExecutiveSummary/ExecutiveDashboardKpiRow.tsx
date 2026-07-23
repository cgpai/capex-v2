import React, { memo } from 'react';
import { ExecutiveSummaryStatCard } from './ExecutiveSummaryStatCard';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import type { ExecutiveDashboardMetrics } from '../../../lib/executiveSummary/dashboardTypes';
import { formatBudgetView } from '../../../lib/formatter';

interface ExecutiveDashboardKpiRowProps {
  metrics: ExecutiveDashboardMetrics;
}

function remainingVsBudgetPlan(value: number, totalBudget: number): { text: string; isOverPlan: boolean } {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeTotal = Number.isFinite(totalBudget) ? totalBudget : 0;
  const remaining = safeTotal - safeValue;
  const isOverPlan = safeValue > safeTotal && safeTotal > 0;
  const pct = safeTotal > 0 ? Math.round((remaining / safeTotal) * 1000) / 10 : 0;

  if (isOverPlan) {
    return {
      text: `Sisa ${formatBudgetView(remaining)} terhadap budget plan (${pct}%)`,
      isOverPlan: true,
    };
  }

  return {
    text: `Sisa ${formatBudgetView(remaining)} terhadap budget plan (${pct}%)`,
    isOverPlan: false,
  };
}

export const ExecutiveDashboardKpiRow = memo(function ExecutiveDashboardKpiRow({
  metrics,
}: ExecutiveDashboardKpiRowProps) {
  const { summary } = metrics;
  const totalBudget = summary.totalBudget;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <ExecutiveSummaryStatCard
        title="Total Budget"
        value={formatBudgetView(summary.totalBudget)}
        subText="100% dari anggaran kategori periode"
        colorClass={EXECUTIVE_SUMMARY_COLORS.primary}
      />
      <RemainingStatCard
        title="Budget Allocation to Project"
        value={summary.budgetAllocationToProject}
        totalBudget={totalBudget}
        colorClass={EXECUTIVE_SUMMARY_COLORS.planning}
      />
      <RemainingStatCard
        title="Budget Approval"
        value={summary.budgetApproval}
        totalBudget={totalBudget}
        colorClass={EXECUTIVE_SUMMARY_COLORS.pipeline}
      />
      <RemainingStatCard
        title="Budget Consumed / Realization"
        value={summary.budgetConsumed}
        totalBudget={totalBudget}
        colorClass={EXECUTIVE_SUMMARY_COLORS.implementation}
      />
      <ExecutiveSummaryStatCard
        title="Budget Revenue Per month"
        value={formatBudgetView(summary.budgetRevenuePerMonth)}
        subText="Total proyeksi revenue bulanan semua proyek"
        colorClass={EXECUTIVE_SUMMARY_COLORS.revenue}
      />
      <UtilizationCard utilizationPct={summary.utilizationPct} />
    </div>
  );
});

const RemainingStatCard = memo(function RemainingStatCard({
  title,
  value,
  totalBudget,
  colorClass,
}: {
  title: string;
  value: number;
  totalBudget: number;
  colorClass: string;
}) {
  const remaining = remainingVsBudgetPlan(value, totalBudget);
  return (
    <ExecutiveSummaryStatCard
      title={title}
      value={formatBudgetView(value)}
      subText={remaining.text}
      subTextClassName={remaining.isOverPlan ? 'text-red-600 font-semibold' : undefined}
      colorClass={colorClass}
    />
  );
});

const UtilizationCard = memo(function UtilizationCard({ utilizationPct }: { utilizationPct: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (utilizationPct / 100) * circumference;

  return (
    <div
      className="bg-siloam-surface rounded-xl shadow-soft overflow-hidden flex flex-col h-full min-h-[140px] border-t-4"
      style={{ borderColor: EXECUTIVE_SUMMARY_COLORS.primary }}
    >
      <div className="p-4 flex items-center gap-4 flex-1">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 88 88" className="transform -rotate-90 w-full h-full">
            <circle cx="44" cy="44" r={radius} fill="transparent" stroke="#E2E8F0" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="transparent"
              stroke={EXECUTIVE_SUMMARY_COLORS.primary}
              strokeWidth="8"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-siloam-text-primary">{utilizationPct}%</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-bold text-siloam-text-secondary uppercase tracking-wider mb-1">
            Budget Utilization
          </div>
          <div className="text-sm text-siloam-text-secondary font-medium">Realisasi asset vs total anggaran</div>
        </div>
      </div>
    </div>
  );
});
