import React, { memo } from 'react';

export const ExecutiveSummaryTableSkeleton = memo(function ExecutiveSummaryTableSkeleton() {
  return (
    <div className="rounded-xl border border-siloam-border overflow-hidden animate-pulse">
      <div className="h-10 bg-siloam-bg" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-11 border-t border-siloam-border bg-siloam-surface/80" />
      ))}
    </div>
  );
});
