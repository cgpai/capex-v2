import React, { memo } from 'react';
import { ExecutiveSummaryStatCard } from './ExecutiveSummaryStatCard';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import type { ExecutiveSummaryStats } from '../../../lib/executiveSummary/types';

export interface ExecutiveSummaryKpiRowProps {
  stats: ExecutiveSummaryStats | undefined;
}

export const ExecutiveSummaryKpiRow = memo(function ExecutiveSummaryKpiRow({ stats }: ExecutiveSummaryKpiRowProps) {
  const filtered = stats?.filteredCount ?? 0;
  const total = stats?.totalProjectsInPeriod ?? 0;
  const preCon = stats?.buckets.preCon.count ?? 0;
  const inCon = stats?.buckets.inCon.count ?? 0;
  const postCon = stats?.buckets.postCon.count ?? 0;
  const attention = stats?.buckets.attention.count ?? 0;
  const scope = filtered || 1;
  const huCount = stats?.activeHuCount ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <ExecutiveSummaryStatCard
        title="Consolidated Active Projects"
        value={filtered}
        subValue={total.toString()}
        subText="Current filtered view"
        colorClass={EXECUTIVE_SUMMARY_COLORS.primary}
        footerText={`${huCount} units in scope`}
      />
      <ExecutiveSummaryStatCard
        title="Planning & Procurement"
        value={preCon}
        subText={`${((preCon / scope) * 100).toFixed(1)}% of scope`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.planning}
        footerText="Schematic • RE • TOR • Tender • LOA • PO"
      />
      <ExecutiveSummaryStatCard
        title="Implementation & Works"
        value={inCon}
        subText={`${((inCon / scope) * 100).toFixed(1)}% of scope`}
        colorClass={EXECUTIVE_SUMMARY_COLORS.implementation}
        footerText={`${attention} projects flagged for attention`}
      />
      <ExecutiveSummaryStatCard
        title="Ready for Operations"
        value={postCon}
        subText="Handover completed YTD"
        colorClass={EXECUTIVE_SUMMARY_COLORS.ready}
        footerText={
          postCon > 0
            ? stats?.buckets.postCon.items.slice(0, 2).map((p) => p.projectName).join(' • ') ?? ''
            : 'No projects completed'
        }
      />
    </div>
  );
});
