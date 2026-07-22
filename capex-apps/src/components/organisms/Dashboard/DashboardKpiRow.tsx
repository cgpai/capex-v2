import React, { memo } from 'react';
import { SummaryCard } from '@/components/molecules/SummaryCard/SummaryCard';
import { DASHBOARD_ICONS } from '@/constants';
import { formatCurrency } from '@/lib/formatter';

export type DashboardKpiRowProps = {
  totalBudget: number;
  totalConsumed: number;
  projectCountDisplay: string;
  isRefreshing?: boolean;
};

export const DashboardKpiRow = memo(function DashboardKpiRow({
  totalBudget,
  totalConsumed,
  projectCountDisplay,
  isRefreshing = false,
}: DashboardKpiRowProps) {
  return (
    <div className={`relative ${isRefreshing ? 'opacity-90' : ''}`}>
      {isRefreshing ? (
        <span
          className="absolute -top-1 right-0 text-xs text-siloam-text-secondary animate-pulse"
          aria-live="polite"
        >
          Updating…
        </span>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Total Budget"
          value={formatCurrency(totalBudget)}
          icon={DASHBOARD_ICONS.Dollar}
        />
        <SummaryCard
          title="Total Projects"
          value={projectCountDisplay}
          icon={DASHBOARD_ICONS.Task}
        />
        <SummaryCard
          title="Total Consumed"
          value={formatCurrency(totalConsumed)}
          icon={DASHBOARD_ICONS.Clock}
        />
      </div>
    </div>
  );
});
