import React from 'react';

export const POUpdatePageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading purchase order data">
    <div className="h-8 max-w-sm bg-siloam-border/60 rounded-lg" />
    <div className="h-12 bg-siloam-border/40 rounded-xl" />
    <div className="h-24 bg-siloam-border/30 rounded-xl" />
    <div className="bg-siloam-surface rounded-xl shadow-soft p-6 border border-siloam-border">
      <div className="border border-siloam-border rounded-xl overflow-hidden">
        <div className="h-10 bg-siloam-sidebar" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-siloam-border flex gap-4 px-4 items-center">
            <div className="h-4 w-32 bg-siloam-border rounded" />
            <div className="h-4 w-24 bg-siloam-border rounded" />
            <div className="h-4 w-40 bg-siloam-border rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
