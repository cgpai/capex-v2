import React from 'react';

export const FSRealizationPageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading FS realization data">
    <div className="h-4 w-full max-w-2xl bg-siloam-border/60 rounded mb-4" />
    <div className="bg-siloam-surface rounded-xl shadow-soft p-6 border border-siloam-border">
      <div className="border border-siloam-border rounded-xl overflow-hidden">
        <div className="h-10 bg-siloam-sidebar" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-siloam-border flex gap-4 px-4 items-center">
            <div className="h-4 w-32 bg-siloam-border rounded" />
            <div className="h-4 w-36 bg-siloam-border rounded" />
            <div className="h-4 w-24 bg-siloam-border rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
