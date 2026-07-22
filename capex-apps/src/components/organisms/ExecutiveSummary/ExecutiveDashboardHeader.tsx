import React, { memo } from 'react';
import type { Archetype } from '../../../types';
import type { ExecutiveSummaryPeriodForHeader } from '../../../lib/executiveSummary/types';
import { fiscalYearLabel, formatAsOfLabel } from '../../../lib/executiveSummary/utils';

interface ExecutiveDashboardHeaderProps {
  period: ExecutiveSummaryPeriodForHeader;
  visibleArchetypes?: Archetype[];
  selectedArchetypeId: string | null;
  onArchetypeChange?: (id: string) => void;
  isRefreshing?: boolean;
}

export const ExecutiveDashboardHeader = memo(function ExecutiveDashboardHeader({
  period,
  visibleArchetypes,
  selectedArchetypeId,
  onArchetypeChange,
  isRefreshing,
}: ExecutiveDashboardHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-bold text-siloam-text-primary tracking-tight">
          Executive Dashboard
        </h1>
        <p className="text-sm text-siloam-text-secondary font-medium">
          Ringkasan CAPEX &amp; Budget Rumah Sakit
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-siloam-text-secondary pt-1">
          <span className="font-bold text-siloam-blue">{fiscalYearLabel(period)}</span>
          <span className="text-siloam-border">|</span>
          <span>As of {formatAsOfLabel(period)}</span>
          {isRefreshing && (
            <>
              <span className="text-siloam-border">|</span>
              <span className="text-siloam-blue animate-pulse">Memperbarui…</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 bg-siloam-surface p-2.5 rounded-xl shadow-soft border border-siloam-border min-w-[240px] hover:border-siloam-blue transition-colors">
        <div className="bg-siloam-blue/10 p-1.5 rounded-lg shrink-0">
          <svg className="w-4 h-4 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold text-siloam-text-secondary uppercase leading-none mb-1">
            Network / Archetype
          </span>
          <select
            className="bg-transparent border-none p-0 text-sm font-bold text-siloam-text-primary focus:ring-0 cursor-pointer w-full"
            value={selectedArchetypeId || ''}
            onChange={(e) => onArchetypeChange?.(e.target.value)}
          >
            <option value="">Semua Network</option>
            {visibleArchetypes?.map((arch) => (
              <option key={arch.id} value={arch.id}>{arch.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
});
