import React from 'react';

export const FSApprovalPageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading FS approval data">
    <div className="bg-siloam-surface rounded-xl shadow-soft p-6 border border-siloam-border">
      <div className="hidden md:flex gap-4 mb-4 border-b border-siloam-border pb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-20 bg-siloam-border rounded" />
        ))}
      </div>
      <div className="border border-siloam-border rounded-xl overflow-hidden">
        <div className="h-10 bg-siloam-sidebar" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-siloam-border flex gap-4 px-4 items-center">
            <div className="h-4 w-28 bg-siloam-border rounded" />
            <div className="h-4 w-40 bg-siloam-border rounded" />
            <div className="h-4 w-24 bg-siloam-border rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
