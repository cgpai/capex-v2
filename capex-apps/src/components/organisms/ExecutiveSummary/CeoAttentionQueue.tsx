import React, { memo, useMemo } from 'react';
import { ProjectStatus } from '../../../types';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import type { ExecutiveSummaryStats } from '../../../lib/executiveSummary/types';
import { projectStatusColorClass, projectStatusLabel } from '../../../lib/executiveSummary/utils';

const ATTENTION_LIMIT = 10;

export interface CeoAttentionQueueProps {
  stats: ExecutiveSummaryStats | undefined;
}

export const CeoAttentionQueue = memo(function CeoAttentionQueue({ stats }: CeoAttentionQueueProps) {
  const items = useMemo(
    () => (stats?.buckets.attention.items ?? []).slice(0, ATTENTION_LIMIT),
    [stats?.buckets.attention.items],
  );
  const total = stats?.buckets.attention.count ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-siloam-text-primary">Projects Needing Attention</h2>
          <p className="text-sm text-siloam-text-secondary font-medium mt-0.5">
            At Risk and Off Track projects requiring management escalation
          </p>
        </div>
        <span
          className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border"
          style={{
            color: EXECUTIVE_SUMMARY_COLORS.risk,
            borderColor: `${EXECUTIVE_SUMMARY_COLORS.risk}40`,
            backgroundColor: `${EXECUTIVE_SUMMARY_COLORS.risk}0D`,
          }}
        >
          {total} flagged
        </span>
      </div>

      {items.length === 0 ? (
        <div className="bg-green-50/80 border border-green-200 rounded-xl p-6 text-center text-sm font-semibold text-siloam-green">
          All projects are on track within the current filter scope.
        </div>
      ) : (
        <div className="bg-siloam-surface rounded-xl border border-siloam-border shadow-soft overflow-hidden">
          <div className="hidden md:grid md:grid-cols-[72px_1fr_80px_100px_1fr] gap-2 px-4 py-2 bg-siloam-bg border-b border-siloam-border text-[10px] font-bold uppercase text-siloam-text-secondary tracking-wider">
            <span>HU</span>
            <span>Project</span>
            <span>Progress</span>
            <span>Status</span>
            <span>Blocker</span>
          </div>
          <div className="divide-y divide-siloam-border/60 max-h-[360px] overflow-y-auto">
            {items.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[72px_1fr_80px_100px_1fr] gap-2 px-4 py-3 hover:bg-siloam-bg/60 transition-colors"
              >
                <span className="text-[11px] font-bold bg-siloam-bg px-1.5 py-0.5 rounded w-fit h-fit">{p.huCode}</span>
                <span className="text-sm font-bold text-siloam-text-primary line-clamp-2">{p.projectName}</span>
                <span className="text-xs font-bold text-siloam-text-primary md:text-center">{p.completionRate}%</span>
                <span className={`text-xs font-bold ${projectStatusColorClass(p.status as ProjectStatus)}`}>
                  {projectStatusLabel(p.status as ProjectStatus)}
                </span>
                <span className="text-xs text-siloam-text-secondary line-clamp-2">{p.taskToDo || 'Action needed'}</span>
              </div>
            ))}
          </div>
          {total > ATTENTION_LIMIT && (
            <div className="px-4 py-2 border-t border-siloam-border text-xs text-siloam-text-secondary font-medium">
              Showing top {ATTENTION_LIMIT} of {total} flagged projects. Use filters below to narrow the registry.
            </div>
          )}
        </div>
      )}
    </section>
  );
});
