import React from 'react';

export const BudgetMultiYearPageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading multi-year budgets">
    <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
      <div className="flex justify-between mb-6">
        <div className="h-4 w-48 bg-siloam-border rounded" />
        <div className="h-9 w-40 bg-siloam-border rounded-xl" />
      </div>
      <div className="hidden md:block border border-siloam-border rounded-xl overflow-hidden">
        <div className="h-10 bg-siloam-sidebar" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-siloam-border bg-siloam-surface flex items-center px-4 gap-4">
            <div className="h-4 w-4 bg-siloam-border rounded-full shrink-0" />
            <div className="h-4 flex-1 max-w-[200px] bg-siloam-border rounded" />
            <div className="h-4 w-24 bg-siloam-border rounded" />
            <div className="h-4 w-32 bg-siloam-border rounded ml-auto" />
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-32 bg-siloam-border/40 rounded-xl" />
        ))}
      </div>
    </div>
  </div>
);
