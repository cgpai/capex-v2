import React from 'react';

/** Partial skeleton — header stays interactive; only data panels pulse. */
export const BudgetHUPageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading hospital unit budget">
    <div className="bg-siloam-surface p-4 rounded-xl border border-siloam-border shadow-soft">
      <div className="h-4 w-48 bg-siloam-border rounded mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-siloam-border/50 rounded-lg" />
        ))}
      </div>
    </div>
    <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
      <div className="h-6 w-64 bg-siloam-border rounded mb-4" />
      <div className="h-10 max-w-md bg-siloam-border/60 rounded-lg mb-4" />
      <div className="hidden md:block border border-siloam-border rounded-xl overflow-hidden">
        <div className="h-10 bg-siloam-sidebar" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-t border-siloam-border flex items-center px-4 gap-4"
          >
            <div className="h-4 w-32 bg-siloam-border rounded" />
            <div className="h-4 w-40 bg-siloam-border rounded" />
            <div className="h-4 w-24 bg-siloam-border rounded ml-auto" />
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-siloam-border/40 rounded-xl" />
        ))}
      </div>
    </div>
  </div>
);
