import React, { memo } from 'react';
import { ExecutiveSummaryStatCard } from './ExecutiveSummaryStatCard';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import type { ExecutiveSummaryStats } from '../../../lib/executiveSummary/types';
import { EMPTY_EXECUTIVE_PULSE } from '../../../lib/executiveSummary/types';
import { formatBudgetView } from '../../../lib/formatter';

export interface CeoExecutivePulseRowProps {
  stats: ExecutiveSummaryStats | undefined;
}

export const CeoExecutivePulseRow = memo(function CeoExecutivePulseRow({ stats }: CeoExecutivePulseRowProps) {
  const pulse = stats?.pulse ?? EMPTY_EXECUTIVE_PULSE;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <ExecutiveSummaryStatCard
        title="Total CAPEX Budget"
        value={formatBudgetView(pulse.totalBudget)}
        subText="Sum of project budget plan + carry forward"
        colorClass={EXECUTIVE_SUMMARY_COLORS.primary}
      />
      <ExecutiveSummaryStatCard
        title="Consumed"
        value={formatBudgetView(pulse.totalConsumed)}
        subText={`${formatBudgetView(pulse.remainingBudgetPlan)} plan not yet consumed (${pulse.remainingBudgetPlanPct}%)`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.implementation}
      />
      <ExecutiveSummaryStatCard
        title="Budget FS Approval"
        value={formatBudgetView(pulse.approvedBudget)}
        subText="Sum of project approved budget"
        colorClass={EXECUTIVE_SUMMARY_COLORS.pipeline}
      />
      <ExecutiveSummaryStatCard
        title="Active Projects"
        value={pulse.activeProjectCount}
        subText={`${pulse.withProgressPct}% with progress (${pulse.withProgressCount} projects)`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.portfolio}
      />
      <ExecutiveSummaryStatCard
        title="No Target End Date"
        value={pulse.noEndDateCount}
        subText={`${pulse.noEndDatePct}% of active projects`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.ready}
      />
      <ExecutiveSummaryStatCard
        title="No Budget Plan"
        value={pulse.noBudgetPlanCount}
        subText={`${pulse.noBudgetPlanPct}% of active projects`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.revenue}
      />
    </div>
  );
});
