import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProjectStatus } from '../../../types';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';
import {
  EXECUTIVE_TABLE_ROW_HEIGHT,
  EXECUTIVE_TABLE_VIEWPORT_HEIGHT,
} from '../../../lib/executiveSummary/constants';
import type { ExecutiveSummaryProjectRow } from '../../../lib/executiveSummary/types';
import {
  formatTargetQuarter,
  projectStatusColorClass,
  projectStatusLabel,
} from '../../../lib/executiveSummary/utils';
import { formatAbbreviatedCurrency } from '../../../lib/formatter';
import { ExecutiveSummaryTableSkeleton } from './ExecutiveSummaryTableSkeleton';

const HEADERS = [
  'Investment Type',
  'HU Code',
  'Project',
  'Assets',
  'Status',
  'Owner',
  'Approved Budget',
  'Target Start',
  'Target End',
  'Revenue (IDR Mn)',
  'Progress',
] as const;

function mapRow(row: ExecutiveSummaryProjectRow, index: number, prevSegment: string) {
  const showSegment = index === 0 || prevSegment !== row.segment;
  const assetLabel = row.assetCount === 1 ? '1 asset' : `${row.assetCount} assets`;
  return {
    showSegment,
    segment: row.segment,
    hu: row.huCode,
    project: row.projectName,
    assets: assetLabel,
    status: projectStatusLabel(row.status as ProjectStatus),
    statusColor: projectStatusColorClass(row.status as ProjectStatus),
    owner: row.owner?.trim() || '—',
    approved: formatAbbreviatedCurrency(row.approvedBudget ?? 0),
    target: formatTargetQuarter(row.targetStart ?? undefined),
    oper: formatTargetQuarter(row.endDate ?? undefined),
    rev: `~${row.revenueProjection.toLocaleString('id-ID')}`,
    progress: `${row.completionRate}%`,
  };
}

export interface ExecutiveSummaryPortfolioTableProps {
  rows: ExecutiveSummaryProjectRow[];
  totalCount: number;
  totalRevenue: number;
  distinctHuCount: number;
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
}

export const ExecutiveSummaryPortfolioTable = memo(function ExecutiveSummaryPortfolioTable({
  rows,
  totalCount,
  totalRevenue,
  distinctHuCount,
  isLoading,
  isFetchingMore,
  isError,
  hasNextPage,
  onLoadMore,
}: ExecutiveSummaryPortfolioTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const displayRows = useMemo(() => {
    let prev = '';
    return rows.map((row, idx) => {
      const mapped = mapRow(row, idx, prev);
      prev = row.segment;
      return { key: row.id, ...mapped };
    });
  }, [rows]);

  const totalHeight = displayRows.length * EXECUTIVE_TABLE_ROW_HEIGHT;
  const visibleCount = Math.ceil(EXECUTIVE_TABLE_VIEWPORT_HEIGHT / EXECUTIVE_TABLE_ROW_HEIGHT) + 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / EXECUTIVE_TABLE_ROW_HEIGHT) - 2);
  const endIndex = Math.min(displayRows.length, startIndex + visibleCount);
  const visibleRows = displayRows.slice(startIndex, endIndex);
  const paddingTop = startIndex * EXECUTIVE_TABLE_ROW_HEIGHT;
  const paddingBottom = Math.max(0, totalHeight - paddingTop - visibleRows.length * EXECUTIVE_TABLE_ROW_HEIGHT);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingMore) onLoadMore();
      },
      { root: scrollRef.current, rootMargin: '120px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingMore, onLoadMore, rows.length]);

  if (isError) {
    return (
      <div className="text-center py-12 text-danger bg-siloam-surface rounded-xl border border-siloam-border">
        Failed to load project registry. Try again or adjust filters.
      </div>
    );
  }

  if (isLoading) return <ExecutiveSummaryTableSkeleton />;

  if (totalCount === 0) {
    return (
      <div className="text-center py-12 text-siloam-text-secondary bg-siloam-surface rounded-xl border border-siloam-border">
        No projects match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-siloam-border shadow-soft bg-siloam-surface">
      <div
        className="text-white py-2.5 px-4 text-center font-bold text-sm tracking-wider uppercase"
        style={{ backgroundColor: EXECUTIVE_SUMMARY_COLORS.header }}
      >
        Capex Project Registry ({totalCount} projects)
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
          <thead className="sticky top-0 z-10 bg-siloam-bg border-b border-siloam-border">
            <tr>
              {HEADERS.map((header) => (
                <th key={header} className="px-4 py-3 text-[11px] font-bold text-siloam-text-primary uppercase whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        </table>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: EXECUTIVE_TABLE_VIEWPORT_HEIGHT }}
        >
          <table className="w-full text-left border-collapse table-fixed min-w-[1200px] text-xs">
            <tbody>
              {paddingTop > 0 && (
                <tr aria-hidden style={{ height: paddingTop }}>
                  <td colSpan={HEADERS.length} />
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-siloam-border/50 hover:bg-siloam-bg transition-colors"
                  style={{ height: EXECUTIVE_TABLE_ROW_HEIGHT }}
                >
                  <td className="px-4 py-2 font-bold text-siloam-green truncate">{row.showSegment ? row.segment : ''}</td>
                  <td className="px-4 py-2 font-bold text-siloam-text-primary">{row.hu}</td>
                  <td className="px-4 py-2 text-siloam-text-secondary font-medium truncate">{row.project}</td>
                  <td className="px-4 py-2 font-bold text-siloam-blue">{row.assets}</td>
                  <td className={`px-4 py-2 font-bold ${row.statusColor}`}>{row.status}</td>
                  <td className="px-4 py-2 text-siloam-text-secondary truncate">{row.owner}</td>
                  <td className="px-4 py-2 font-bold text-siloam-text-primary">{row.approved}</td>
                  <td className="px-4 py-2 text-siloam-text-secondary">{row.target}</td>
                  <td className="px-4 py-2 text-siloam-text-secondary">{row.oper}</td>
                  <td className="px-4 py-2 font-bold text-siloam-blue">{row.rev}</td>
                  <td className="px-4 py-2 font-bold text-siloam-green">{row.progress}</td>
                </tr>
              ))}
              {paddingBottom > 0 && (
                <tr aria-hidden style={{ height: paddingBottom }}>
                  <td colSpan={HEADERS.length} />
                </tr>
              )}
            </tbody>
          </table>
          <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-siloam-text-secondary">
            {isFetchingMore ? 'Loading more…' : hasNextPage ? 'Scroll for more' : 'End of list'}
          </div>
        </div>
      </div>

      <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
        <tfoot>
          <tr className="text-white font-bold text-xs" style={{ backgroundColor: EXECUTIVE_SUMMARY_COLORS.header }}>
            <td className="px-4 py-3">{distinctHuCount} HUs</td>
            <td colSpan={2} className="px-4 py-3 uppercase tracking-wider">Portfolio total</td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3 uppercase">Filtered</td>
            <td colSpan={2} className="px-4 py-3" />
            <td className="px-4 py-3 uppercase">Revenue est.</td>
            <td className="px-4 py-3">~{totalRevenue.toLocaleString('id-ID')}</td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
});
