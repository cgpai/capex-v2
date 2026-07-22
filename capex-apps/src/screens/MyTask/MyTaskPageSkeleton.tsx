import React, { memo } from 'react';

/** Non-blocking shell — filter bar + kanban placeholders paint immediately. */
export const MyTaskPageSkeleton = memo(function MyTaskPageSkeleton() {
  return (
    <div className="space-y-6 h-full flex flex-col animate-pulse" aria-busy="true" aria-label="Loading tasks">
      <div className="bg-siloam-surface p-4 rounded-xl shadow-soft space-y-3">
        <div className="h-10 w-full max-w-xl bg-siloam-border rounded-lg" />
        <div className="flex gap-4 justify-end">
          <div className="h-10 w-64 bg-siloam-border rounded-lg" />
          <div className="h-10 w-24 bg-siloam-border rounded-lg" />
        </div>
      </div>
      <div className="hidden md:flex flex-1 gap-6 min-h-[320px]">
        <div className="flex-1 bg-siloam-bg rounded-xl border border-siloam-border p-4 space-y-4">
          <div className="h-6 w-40 bg-siloam-border rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-siloam-surface rounded-xl border border-siloam-border" />
          ))}
        </div>
        <div className="flex-1 bg-siloam-bg rounded-xl border border-siloam-border p-4 space-y-4">
          <div className="h-6 w-24 bg-siloam-border rounded" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 bg-siloam-surface rounded-xl border border-siloam-border" />
          ))}
        </div>
      </div>
      <div className="md:hidden space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-siloam-surface rounded-xl border border-siloam-border" />
        ))}
      </div>
    </div>
  );
});
