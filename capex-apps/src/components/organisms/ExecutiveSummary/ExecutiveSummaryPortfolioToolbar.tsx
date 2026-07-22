import React, { memo } from 'react';
import type {
  CapexTypeFilter,
  ExecutiveSummaryFilters,
  ExecutiveSummaryUnitOption,
  ProjectSortField,
  SortDir,
  StatusFilter,
} from '../../../lib/executiveSummary/types';

const SORT_OPTIONS: { value: ProjectSortField; label: string }[] = [
  { value: 'project_name', label: 'Project Name' },
  { value: 'completion_rate', label: 'Progress' },
  { value: 'revenue_projection', label: 'Revenue' },
  { value: 'status', label: 'Status' },
  { value: 'target_start', label: 'Target Start' },
  { value: 'end_date', label: 'End Date' },
];

const CAPEX_TYPE_OPTIONS: { id: CapexTypeFilter; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'strategic', label: 'Strategic' },
  { id: 'general', label: 'General & Routine' },
  { id: 'pipeline', label: 'Pipeline' },
];

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All Status' },
  { id: 'on-track', label: 'On Track' },
  { id: 'at-risk', label: 'At Risk' },
  { id: 'off-track', label: 'Off Track' },
];

export interface ExecutiveSummaryPortfolioToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: ProjectSortField;
  sortDir: SortDir;
  onSortByChange: (value: ProjectSortField) => void;
  onSortDirChange: (value: SortDir) => void;
  totalCount: number;
  loadedCount: number;
  filters: ExecutiveSummaryFilters;
  unitOptions: ExecutiveSummaryUnitOption[];
  onCapexTypeChange: (value: CapexTypeFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onHuToggle: (code: string) => void;
}

export const ExecutiveSummaryPortfolioToolbar = memo(function ExecutiveSummaryPortfolioToolbar({
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
  totalCount,
  loadedCount,
  filters,
  unitOptions,
  onCapexTypeChange,
  onStatusChange,
  onHuToggle,
}: ExecutiveSummaryPortfolioToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search project name or code…"
            className="w-full pl-3 pr-3 py-2 text-sm border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            aria-label="Search projects"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="text-siloam-text-secondary font-semibold">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as ProjectSortField)}
            className="border border-siloam-border rounded-lg px-2 py-1.5 bg-siloam-surface text-siloam-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sortDir}
            onChange={(e) => onSortDirChange(e.target.value as SortDir)}
            className="border border-siloam-border rounded-lg px-2 py-1.5 bg-siloam-surface text-siloam-text-primary"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          <span className="text-siloam-text-secondary ml-1">
            Showing {loadedCount} / {totalCount}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-siloam-text-secondary uppercase tracking-wider shrink-0">Project Type</span>
          {CAPEX_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onCapexTypeChange(opt.id)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                filters.capexType === opt.id
                  ? 'bg-siloam-blue text-white border-siloam-blue'
                  : 'bg-siloam-bg text-siloam-text-primary border-siloam-border hover:border-siloam-blue/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-siloam-text-secondary uppercase tracking-wider shrink-0">Status</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusChange(opt.id)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                filters.status === opt.id
                  ? 'bg-siloam-blue text-white border-siloam-blue'
                  : 'bg-siloam-bg text-siloam-text-primary border-siloam-border hover:border-siloam-blue/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {unitOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-siloam-text-secondary uppercase tracking-wider shrink-0">Hospital Unit</span>
            <button
              type="button"
              onClick={() => onHuToggle('')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                filters.huCodes.length === 0
                  ? 'bg-siloam-blue text-white border-siloam-blue'
                  : 'bg-siloam-bg text-siloam-text-primary border-siloam-border hover:border-siloam-blue/40'
              }`}
            >
              All Units
            </button>
            {unitOptions.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onHuToggle(u.code)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                  filters.huCodes.includes(u.code)
                    ? 'bg-siloam-blue text-white border-siloam-blue'
                    : 'bg-siloam-bg text-siloam-text-primary border-siloam-border hover:border-siloam-blue/40'
                }`}
              >
                {u.code}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
