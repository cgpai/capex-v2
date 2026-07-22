import React, { memo } from 'react';

/** Non-blocking shell — layout paints immediately while data loads. */
export const BDDConstructionPageSkeleton = memo(function BDDConstructionPageSkeleton() {
  return (
    <div className="md:flex h-full bg-siloam-surface rounded-xl shadow-soft overflow-hidden animate-pulse">
      <div className="flex flex-col h-full w-full md:border-r md:border-siloam-border">
        <div className="px-4 py-3 border-b border-siloam-border flex justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-siloam-border rounded" />
            <div className="h-4 w-64 bg-siloam-border/70 rounded" />
          </div>
          <div className="h-9 w-20 bg-siloam-border rounded-lg" />
        </div>
        <div className="h-14 border-b border-siloam-border bg-siloam-bg/50" />
        <div className="flex-1 p-4 bg-siloam-bg space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-siloam-surface rounded-lg border border-siloam-border" />
          ))}
        </div>
      </div>
    </div>
  );
});
