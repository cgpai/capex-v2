'use client';

import React, { memo } from 'react';
import type { EnrichedAsset } from '@/types';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import { GenericTable } from '@/components/organisms/GenericTable/GenericTable';
import { CapexProjectListMobileAssetList } from './CapexProjectListMobileAssetList';

export type CapexProjectListTableBlockProps = {
  columns: Column<EnrichedAsset>[];
  paginatedAssets: EnrichedAsset[];
  selectedAssetId?: string | number | null;
  onRowClick: (asset: EnrichedAsset) => void;
  onRowHover: (asset: EnrichedAsset) => void;
  showInitialLoading: boolean;
  isFilterRefreshing: boolean;
  isSearchActive: boolean;
  isBackgroundRefresh: boolean;
  hasActiveFilters: boolean;
  footerTotalCount: number;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  isExporting: boolean;
  onExportExcel: () => void;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

function CapexProjectListTableBlockInner({
  columns,
  paginatedAssets,
  selectedAssetId,
  onRowClick,
  onRowHover,
  showInitialLoading,
  isFilterRefreshing,
  isSearchActive,
  isBackgroundRefresh,
  hasActiveFilters,
  footerTotalCount,
  currentPage,
  itemsPerPage,
  totalPages,
  isExporting,
  onExportExcel,
  onPageChange,
  onItemsPerPageChange,
}: CapexProjectListTableBlockProps) {
  return (
    <div data-tour="cpl-asset-table" className="flex-1 overflow-hidden flex flex-col relative">
      {showInitialLoading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-siloam-surface/80">
          <p className="text-sm font-medium text-siloam-text-secondary">Memuat daftar proyek…</p>
        </div>
      ) : null}
      {isFilterRefreshing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center bg-siloam-surface/90 py-1">
          <p className="text-xs text-siloam-text-secondary">
            {isSearchActive ? 'Mencari…' : 'Memfilter…'}
          </p>
        </div>
      ) : null}
      {isBackgroundRefresh ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-siloam-border"
            aria-hidden
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-siloam-blue/70" />
          </div>
          <div className="pointer-events-none absolute right-2 top-1 z-20 rounded border border-siloam-border bg-siloam-surface/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary shadow-sm">
            Memperbarui…
          </div>
        </>
      ) : null}

      <div className="hidden md:block flex-1 overflow-hidden">
        <GenericTable
          columns={columns}
          data={paginatedAssets}
          onRowClick={onRowClick}
          onRowMouseEnter={onRowHover}
          selectedRowId={selectedAssetId}
          className="h-full border-none"
          virtualizeRows="auto"
          estimatedRowHeight={52}
        />
      </div>

      <div className="block md:hidden flex-1 overflow-hidden p-4">
        <CapexProjectListMobileAssetList
          assets={paginatedAssets}
          selectedAssetId={selectedAssetId}
          onRowClick={onRowClick}
          onRowHover={onRowHover}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-t border-siloam-border bg-siloam-surface">
        <div className="flex items-center gap-3">
          <div className="text-sm text-siloam-text-secondary">
            Showing {footerTotalCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
            {Math.min(currentPage * itemsPerPage, footerTotalCount)} of {footerTotalCount} assets
          </div>
          <button
            type="button"
            data-tour="cpl-export"
            onClick={onExportExcel}
            disabled={footerTotalCount === 0 || isExporting}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={
              footerTotalCount > 0
                ? `Export semua ${footerTotalCount.toLocaleString('id-ID')} baris (sesuai filter)`
                : 'No data to export'
            }
          >
            {isExporting ? 'Menyiapkan…' : 'Export Excel'}
          </button>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="flex items-center gap-2">
            <label className="text-sm text-siloam-text-secondary">Per page:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => onPageChange(pageNum)}
                      className={`px-3 py-1 border rounded text-sm ${
                        currentPage === pageNum
                          ? 'bg-siloam-blue text-white border-siloam-blue'
                          : 'border-siloam-border bg-siloam-bg hover:bg-siloam-surface'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const CapexProjectListTableBlock = memo(CapexProjectListTableBlockInner);
CapexProjectListTableBlock.displayName = 'CapexProjectListTableBlock';
