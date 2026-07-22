import React from 'react';

interface FsScreenRefreshChromeProps {
  isBlockingLoad: boolean;
  isBackgroundRefresh: boolean;
  isFilterRefreshing: boolean;
  hasListData: boolean;
  blockingMessage?: string;
  filterMessage?: string;
}

export const FsScreenRefreshChrome: React.FC<FsScreenRefreshChromeProps> = ({
  isBlockingLoad,
  isBackgroundRefresh,
  isFilterRefreshing,
  hasListData,
  blockingMessage = 'Memuat data…',
  filterMessage = 'Memfilter…',
}) => (
  <>
    {isBlockingLoad ? (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-siloam-surface/80">
        <p className="text-sm font-medium text-siloam-text-secondary">{blockingMessage}</p>
      </div>
    ) : null}
    {isFilterRefreshing && hasListData ? (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center bg-siloam-surface/90 py-1">
        <p className="text-xs text-siloam-text-secondary">{filterMessage}</p>
      </div>
    ) : null}
    {isBackgroundRefresh ? (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-siloam-border"
        aria-hidden
      >
        <div className="h-full w-1/3 animate-pulse rounded-full bg-siloam-blue/70" />
      </div>
    ) : null}
    {isBackgroundRefresh ? (
      <div className="pointer-events-none absolute right-2 top-1 z-20 rounded border border-siloam-border bg-siloam-surface/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary shadow-sm">
        Memperbarui…
      </div>
    ) : null}
  </>
);

FsScreenRefreshChrome.displayName = 'FsScreenRefreshChrome';
