import React, { memo } from 'react';
import type { Archetype } from '../../../types';
import type { ExecutiveSummaryPeriodForHeader } from '../../../lib/executiveSummary/types';
import { fiscalYearLabel, formatAsOfLabel } from '../../../lib/executiveSummary/utils';

interface ExecutiveDashboardHeaderProps {
  period: ExecutiveSummaryPeriodForHeader | null;
  visibleArchetypes?: Archetype[];
  selectedArchetypeId: string | null;
  onArchetypeChange?: (id: string) => void;
  isRefreshing?: boolean;
  isMetricsLoading?: boolean;
}

export const ExecutiveDashboardHeader = memo(function ExecutiveDashboardHeader({
  period,
  visibleArchetypes,
  selectedArchetypeId,
  onArchetypeChange,
  isRefreshing,
  isMetricsLoading,
}: ExecutiveDashboardHeaderProps) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-2 border-b border-siloam-border/60">
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl lg:text-3xl font-bold text-siloam-text-primary tracking-tight">
            Executive Dashboard
          </h1>
          {isMetricsLoading ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-siloam-blue/10 px-3 py-1 text-xs font-bold text-siloam-blue">
              <span className="w-3 h-3 border-2 border-siloam-blue border-t-transparent rounded-full animate-spin" />
              Memuat data…
            </span>
          ) : null}
        </div>
        <p className="text-sm text-siloam-text-secondary font-medium">
          Ringkasan CAPEX &amp; Budget Rumah Sakit
        </p>
        {period ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-siloam-text-secondary pt-0.5">
            <span className="font-bold text-siloam-blue">{fiscalYearLabel(period)}</span>
            <span className="text-siloam-border hidden sm:inline">|</span>
            <span>As of {formatAsOfLabel(period)}</span>
            {isRefreshing ? (
              <>
                <span className="text-siloam-border hidden sm:inline">|</span>
                <span className="text-siloam-blue animate-pulse">Memperbarui…</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 bg-siloam-surface px-3 py-2.5 rounded-xl shadow-soft border border-siloam-border w-full lg:w-auto lg:min-w-[260px] hover:border-siloam-blue/40 transition-colors">
        <div className="bg-siloam-blue/10 p-1.5 rounded-lg shrink-0">
          <svg className="w-4 h-4 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <label htmlFor="executive-archetype-filter" className="text-[10px] font-bold text-siloam-text-secondary uppercase leading-none mb-1">
            Network / Archetype
          </label>
          <select
            id="executive-archetype-filter"
            className="bg-transparent border-none p-0 text-sm font-bold text-siloam-text-primary focus:ring-0 cursor-pointer w-full truncate appearance-none"
            value={selectedArchetypeId || ''}
            onChange={(e) => onArchetypeChange?.(e.target.value)}
            disabled={isMetricsLoading}
          >
            <option value="">Semua Network</option>
            {visibleArchetypes?.map((arch) => (
              <option key={arch.id} value={arch.id}>{arch.name}</option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
});
