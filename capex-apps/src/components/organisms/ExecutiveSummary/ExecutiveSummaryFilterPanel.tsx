import React from 'react';
import type { CapexTypeFilter, ExecutiveSummaryFilters, ExecutiveSummaryUnitOption, StatusFilter } from '../../../lib/executiveSummary/types';

interface FilterChipGroupProps {
  title: string;
  options: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
  columns?: number;
}

const FilterChipGroup: React.FC<FilterChipGroupProps> = ({ title, options, activeId, onChange, columns = 1 }) => (
  <div className="bg-siloam-surface rounded border border-siloam-border shadow-sm overflow-hidden mb-4">
    <div className="border-b border-siloam-border px-3 py-1.5">
      <span className="text-[10px] font-bold text-siloam-text-primary uppercase">{title}</span>
    </div>
    <div
      className={`p-2 grid gap-1 ${columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-1'}`}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-colors text-left ${
            activeId === opt.id ? 'bg-siloam-blue text-white' : 'bg-siloam-bg text-siloam-text-primary hover:bg-siloam-blue/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

interface ExecutiveSummaryFilterPanelProps {
  filters: ExecutiveSummaryFilters;
  onCapexTypeChange: (value: CapexTypeFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onHuToggle: (code: string) => void;
  unitOptions: ExecutiveSummaryUnitOption[];
}

export const ExecutiveSummaryFilterPanel: React.FC<ExecutiveSummaryFilterPanelProps> = ({
  filters,
  onCapexTypeChange,
  onStatusChange,
  onHuToggle,
  unitOptions,
}) => (
  <div>
    <div className="text-sm font-bold text-siloam-text-primary uppercase mb-4 border-b-2 border-siloam-blue pb-1">
      Governance Controls
    </div>
    <FilterChipGroup
      title="CAPEX Type"
      activeId={filters.capexType}
      onChange={(id) => onCapexTypeChange(id as ExecutiveSummaryFilters['capexType'])}
      options={[
        { id: 'all', label: 'All Types' },
        { id: 'new-facility', label: 'New Facility' },
        { id: 'pipeline', label: 'Pipeline' },
      ]}
    />
    <FilterChipGroup
      title="Project Status"
      activeId={filters.status}
      onChange={(id) => onStatusChange(id as StatusFilter)}
      options={[
        { id: 'all', label: 'All' },
        { id: 'on-track', label: 'On Track' },
        { id: 'at-risk', label: 'At Risk' },
        { id: 'off-track', label: 'Off Track' },
      ]}
      columns={2}
    />
    {unitOptions.length > 0 && (
      <FilterChipGroup
        title="Hospital Unit (toggle)"
        activeId=""
        onChange={(code) => onHuToggle(code)}
        columns={4}
        options={[
          { id: '', label: filters.huCodes.length === 0 ? 'All Units ✓' : 'Show All Units' },
          ...unitOptions.map((u) => ({
            id: u.code,
            label: filters.huCodes.includes(u.code) ? `${u.code} ✓` : u.code,
          })),
        ]}
      />
    )}
  </div>
);
