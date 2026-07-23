import { useDeferredValue, useMemo } from 'react';
import type { EnrichedAsset } from '../../../types';
import type { ClientFilteredProjectListPage } from '../listUtils';

export type ProjectListTableDisplayInput = {
  useClientFilteredDisplay: boolean;
  clientFilteredPage: ClientFilteredProjectListPage | null;
  serverTableReady: boolean;
  allAssets: EnrichedAsset[];
  listTotalAssetCount: number | null;
  /** Show preloaded rows while server key catches up (default view, no active filters). */
  allowPreloadRows?: boolean;
  /** Defer visible rows only during active search/filter transitions (not client pool path). */
  deferTableRows?: boolean;
  /** Hide stale rows while server fetches another page. */
  isPageTransition?: boolean;
};

export type ProjectListTableDisplay = {
  paginatedAssets: EnrichedAsset[];
  tableAssets: EnrichedAsset[];
  footerTotalCount: number;
  serverTableReady: boolean;
};

/**
 * Derive visible page rows.
 * - `paginatedAssets`: immediate (footer, selection sync, columns)
 * - `tableAssets`: deferred only when `deferTableRows` to avoid double-lag with client search defer
 */
export function useProjectListTableDisplay({
  useClientFilteredDisplay,
  clientFilteredPage,
  serverTableReady,
  allAssets,
  listTotalAssetCount,
  allowPreloadRows = false,
  deferTableRows = false,
  isPageTransition = false,
}: ProjectListTableDisplayInput): ProjectListTableDisplay {
  const paginatedAssets = useMemo(() => {
    if (isPageTransition) return [];
    if (useClientFilteredDisplay && clientFilteredPage) return clientFilteredPage.assets;
    if (serverTableReady) return allAssets;
    if (allowPreloadRows && allAssets.length > 0) return allAssets;
    return [];
  }, [
    isPageTransition,
    useClientFilteredDisplay,
    clientFilteredPage,
    serverTableReady,
    allowPreloadRows,
    allAssets,
  ]);

  const deferredTableAssets = useDeferredValue(paginatedAssets);
  const tableAssets = deferTableRows ? deferredTableAssets : paginatedAssets;

  const footerTotalCount = useMemo(() => {
    if (useClientFilteredDisplay && clientFilteredPage) {
      return clientFilteredPage.totalAssetCount;
    }
    if (serverTableReady) {
      return listTotalAssetCount ?? allAssets.length;
    }
    if (listTotalAssetCount != null && listTotalAssetCount > 0) {
      return listTotalAssetCount;
    }
    return 0;
  }, [
    useClientFilteredDisplay,
    clientFilteredPage,
    serverTableReady,
    listTotalAssetCount,
    allAssets.length,
  ]);

  return {
    paginatedAssets,
    tableAssets,
    footerTotalCount,
    serverTableReady,
  };
}
