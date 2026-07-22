import React, { memo } from 'react';
import type { Archetype } from '../../../types';
import type { ExecutiveSummaryPeriodForHeader } from '../../../lib/executiveSummary/types';
import { fiscalYearLabel, formatAsOfLabel } from '../../../lib/executiveSummary/utils';

interface ExecutiveSummaryHeaderProps {
  period: ExecutiveSummaryPeriodForHeader;
  visibleArchetypes?: Archetype[];
  selectedArchetypeId: string | null;
  onArchetypeChange?: (id: string) => void;
  filteredCount: number;
  totalCount: number;
  activeHuCount: number;
}

export const ExecutiveSummaryHeader = memo(function ExecutiveSummaryHeader({
  period,
  visibleArchetypes,
  selectedArchetypeId,
  onArchetypeChange,
  filteredCount,
  totalCount,
  activeHuCount,
}: ExecutiveSummaryHeaderProps) {
  return (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3 text-siloam-blue mb-1">
          <h1 className="text-3xl font-bold tracking-tight">Group CAPEX Overview</h1>
          <span className="text-3xl font-normal text-siloam-text-secondary">as of</span>
          <span className="text-3xl font-bold">{formatAsOfLabel(period)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-siloam-text-secondary font-medium text-sm">
          <span className="text-siloam-blue font-bold tracking-wide">{fiscalYearLabel(period)}</span>
          <span className="text-siloam-border">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-siloam-blue" />
            {activeHuCount} Active Hospital Units
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-siloam-surface p-2.5 rounded-xl shadow-soft border border-siloam-border max-w-sm hover:border-siloam-blue transition-colors">
        <div className="bg-siloam-blue/10 p-1.5 rounded-lg shrink-0">
          <svg className="w-4 h-4 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold text-siloam-text-secondary uppercase leading-none mb-1">Network</span>
          <select
            className="bg-transparent border-none p-0 text-sm font-bold text-siloam-text-primary focus:ring-0 cursor-pointer min-w-[180px]"
            value={selectedArchetypeId || ''}
            onChange={(e) => onArchetypeChange?.(e.target.value)}
          >
            <option value="">View All Strategic Networks</option>
            {visibleArchetypes?.map((arch) => (
              <option key={arch.id} value={arch.id}>{arch.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>

    <div className="text-[10px] font-bold text-siloam-text-secondary uppercase tracking-widest bg-siloam-bg px-3 py-1 rounded-full border border-siloam-border">
      Projects in scope: <span className="text-siloam-blue">{filteredCount}</span> of {totalCount}
    </div>
  </div>
  );
});
