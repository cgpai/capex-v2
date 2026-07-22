import React, { memo } from 'react';
import { ExecutiveSummaryStatCard } from './ExecutiveSummaryStatCard';
import { ExecutiveSummaryPortfolioTable } from './ExecutiveSummaryPortfolioTable';
import { ExecutiveSummaryPortfolioToolbar } from './ExecutiveSummaryPortfolioToolbar';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import type {
  CapexTypeFilter,
  ExecutiveSummaryFilters,
  ExecutiveSummaryProjectRow,
  ExecutiveSummaryStats,
  ExecutiveSummaryUnitOption,
  ProjectSortField,
  SortDir,
  StatusFilter,
} from '../../../lib/executiveSummary/types';

export interface ExecutiveSummaryPortfolioSectionProps {
  stats: ExecutiveSummaryStats | undefined;
  tableRows: ExecutiveSummaryProjectRow[];
  totalCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: ProjectSortField;
  sortDir: SortDir;
  onSortByChange: (value: ProjectSortField) => void;
  onSortDirChange: (value: SortDir) => void;
  isTableLoading: boolean;
  isFetchingMore: boolean;
  isTableError: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  filters: ExecutiveSummaryFilters;
  unitOptions: ExecutiveSummaryUnitOption[];
  onCapexTypeChange: (value: CapexTypeFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onHuToggle: (code: string) => void;
}

export const ExecutiveSummaryPortfolioSection = memo(function ExecutiveSummaryPortfolioSection({
  stats,
  tableRows,
  totalCount,
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
  isTableLoading,
  isFetchingMore,
  isTableError,
  hasNextPage,
  onLoadMore,
  filters,
  unitOptions,
  onCapexTypeChange,
  onStatusChange,
  onHuToggle,
}: ExecutiveSummaryPortfolioSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-siloam-blue">CAPEX Project Registry</h2>
        <p className="text-sm text-siloam-text-secondary font-medium mt-1">
          Construction, medical equipment, and IT — drill down into project detail
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExecutiveSummaryStatCard
          title="Total CAPEX Assets"
          value={stats?.totalAssetImpact ?? 0}
          subText={`Items targeted across ${stats?.activeHuCount ?? 0} units`}
          colorClass={EXECUTIVE_SUMMARY_COLORS.portfolio}
        />
        <ExecutiveSummaryStatCard
          title="Portfolio Revenue Est."
          value={`~${(stats?.totalRevenue ?? 0).toLocaleString('id-ID')}`}
          subText="IDR Mn · from project revenue projection"
          colorClass={EXECUTIVE_SUMMARY_COLORS.revenue}
        />
      </div>

      <ExecutiveSummaryPortfolioToolbar
        search={search}
        onSearchChange={onSearchChange}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={onSortByChange}
        onSortDirChange={onSortDirChange}
        totalCount={totalCount}
        loadedCount={tableRows.length}
        filters={filters}
        unitOptions={unitOptions}
        onCapexTypeChange={onCapexTypeChange}
        onStatusChange={onStatusChange}
        onHuToggle={onHuToggle}
      />

      <ExecutiveSummaryPortfolioTable
        rows={tableRows}
        totalCount={totalCount}
        totalRevenue={stats?.totalRevenue ?? 0}
        distinctHuCount={stats?.activeHuCount ?? 0}
        isLoading={isTableLoading}
        isFetchingMore={isFetchingMore}
        isError={isTableError}
        hasNextPage={hasNextPage}
        onLoadMore={onLoadMore}
      />
    </section>
  );
});
