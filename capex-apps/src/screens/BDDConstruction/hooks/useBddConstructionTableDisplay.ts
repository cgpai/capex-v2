import { useDeferredValue } from 'react';
import type { EnrichedAsset } from '../../../types';

export type BddTableDisplayInput = {
  filteredAssets: EnrichedAsset[];
  listTotalAssetCount: number | null;
  itemsPerPage: number;
  currentPage: number;
  /** Defer visible rows during search/filter transitions to keep typing responsive. */
  deferTableRows?: boolean;
};

export type BddTableDisplay = {
  paginatedListAssets: EnrichedAsset[];
  tableAssets: EnrichedAsset[];
  footerTotalCount: number;
  totalPages: number;
};

export function useBddConstructionTableDisplay({
  filteredAssets,
  listTotalAssetCount,
  itemsPerPage,
  currentPage,
  deferTableRows = false,
}: BddTableDisplayInput): BddTableDisplay {
  const paginatedListAssets = filteredAssets;
  const deferredTableAssets = useDeferredValue(paginatedListAssets);
  const tableAssets = deferTableRows ? deferredTableAssets : paginatedListAssets;

  const footerTotalCount = listTotalAssetCount ?? filteredAssets.length;
  const totalPages = Math.max(1, Math.ceil(footerTotalCount / itemsPerPage));

  return {
    paginatedListAssets,
    tableAssets,
    footerTotalCount,
    totalPages,
  };
}
