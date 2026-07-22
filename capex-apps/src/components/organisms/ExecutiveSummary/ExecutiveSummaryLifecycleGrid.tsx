import React, { memo } from 'react';
import { ExecutiveSummaryProjectRow } from './ExecutiveSummaryProjectRow';
import { PlanningBudgetScoringColumn } from './PlanningBudgetScoringColumn';
import type { ExecutiveSummaryStats } from '../../../lib/executiveSummary/types';
import { projectStatusColorClass } from '../../../lib/executiveSummary/utils';
import { ProjectStatus } from '../../../types';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';

export interface ExecutiveSummaryLifecycleGridProps {
  stats: ExecutiveSummaryStats | undefined;
}

export const ExecutiveSummaryLifecycleGrid = memo(function ExecutiveSummaryLifecycleGrid({
  stats,
}: ExecutiveSummaryLifecycleGridProps) {
  const filteredTotal = stats?.filteredCount ?? 0;
  const preCon = stats?.buckets.preCon;
  const inCon = stats?.buckets.inCon;
  const postCon = stats?.buckets.postCon;

  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-center p-1.5 rounded-md border"
        style={{ backgroundColor: `${EXECUTIVE_SUMMARY_COLORS.header}0D`, borderColor: `${EXECUTIVE_SUMMARY_COLORS.header}1A` }}
      >
        <span className="text-xs font-extrabold text-siloam-text-primary uppercase tracking-[0.25em]">
          CAPEX Execution Stages
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        <LifecycleColumn
          step={1}
          title="Budget Scoring"
          headerClass="bg-siloam-blue"
          count={preCon?.count ?? 0}
          countLabel="Projects"
          subtitle="Highest budget plan · click project to view assets"
        >
          <PlanningBudgetScoringColumn bucket={preCon} />
        </LifecycleColumn>

        <LifecycleColumn step={2} title="Implementation" headerClass="bg-siloam-gold" count={inCon?.count ?? 0} countLabel="Projects" countClass="text-siloam-gold">
          {inCon?.items.map((p) => (
            <ExecutiveSummaryProjectRow
              key={p.id}
              code={p.huCode}
              name={p.projectName}
              status={`${p.completionRate}%`}
              statusColor={projectStatusColorClass(p.status as ProjectStatus)}
            />
          ))}
          {(inCon?.count ?? 0) === 0 && <EmptyStage />}
        </LifecycleColumn>

        <LifecycleColumn step={3} title="Operational Readiness" headerClass="bg-siloam-green" count={postCon?.count ?? 0} countLabel="Ready" countClass="text-siloam-green" subtitle="Assets deployed and handover completed">
          {postCon?.items.map((p) => (
            <div key={p.id} className="p-4 rounded-lg border-l-4 border-siloam-green bg-green-50/80">
              <div className="text-[11px] font-bold text-white bg-siloam-green px-1.5 py-0.5 rounded w-fit mb-2">{p.huCode}</div>
              <div className="text-sm font-bold text-siloam-text-primary leading-tight mb-3">{p.projectName}</div>
              <div className="text-xs text-siloam-green font-bold">Go-Live ready</div>
            </div>
          ))}
          {(postCon?.count ?? 0) === 0 && <EmptyStage />}
          <div className="mt-4 pt-3 border-t border-siloam-border text-[11px] font-bold text-siloam-text-secondary">
            {postCon?.count ?? 0} of {filteredTotal} projects are now operational
          </div>
        </LifecycleColumn>
      </div>
    </div>
  );
});

const EmptyStage: React.FC = () => (
  <div className="text-xs text-siloam-text-secondary py-4 text-center">No projects in this stage</div>
);

const LifecycleColumn: React.FC<{
  step: number;
  title: string;
  headerClass: string;
  count: number;
  countLabel: string;
  countClass?: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ step, title, headerClass, count, countLabel, countClass, subtitle, children }) => (
  <div className="bg-siloam-surface rounded-xl shadow-soft overflow-hidden flex flex-col h-full border border-siloam-border">
    <div className={`${headerClass} p-3 flex items-center gap-3`}>
      <span className="bg-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-siloam-text-primary">{step}</span>
      <h3 className="text-white font-bold text-sm uppercase tracking-wider">{title}</h3>
    </div>
    <div className="p-4 flex-1">
      <div className={`text-2xl font-bold mb-1 ${countClass || 'text-siloam-blue'}`}>{count} {countLabel}</div>
      {subtitle && <div className="text-xs text-siloam-text-secondary mb-4">{subtitle}</div>}
      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">{children}</div>
    </div>
  </div>
);
