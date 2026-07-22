import React, { memo } from 'react';

export const DashboardSelectPeriod = memo(function DashboardSelectPeriod() {
  return (
    <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft">
      Please select a budget period to view the dashboard.
    </div>
  );
});

export const DashboardError = memo(function DashboardError({ message }: { message: string }) {
  return <div className="text-center p-8 text-danger">{message}</div>;
});

export const DashboardBlockingSkeleton = memo(function DashboardBlockingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-siloam-surface rounded-xl shadow-soft" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
      </div>
      <div className="h-[480px] bg-siloam-surface rounded-xl shadow-soft" />
    </div>
  );
});

export const DashboardChartsSkeleton = memo(function DashboardChartsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
        <div className="h-80 bg-siloam-surface rounded-xl shadow-soft" />
      </div>
      <div className="h-[480px] bg-siloam-surface rounded-xl shadow-soft" />
    </div>
  );
});

export const DashboardBackendUnavailable = memo(function DashboardBackendUnavailable() {
  return (
    <div className="text-center p-8 bg-siloam-surface rounded-xl shadow-soft text-siloam-text-secondary">
      Dashboard data is unavailable. Ensure the API is running and{' '}
      <code className="text-xs">NEXT_PUBLIC_CAPEXBE_URL</code> is set, or enable Supabase fallback for
      development.
    </div>
  );
});
