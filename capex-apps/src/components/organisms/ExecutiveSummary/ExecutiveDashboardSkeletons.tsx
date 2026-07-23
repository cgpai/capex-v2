import React, { memo } from 'react';

const pulse = 'animate-pulse bg-siloam-border/40 rounded';

/** Shown above KPI/charts while a new network filter is loading. */
export const ExecutiveDashboardFilterLoadingBanner = memo(function ExecutiveDashboardFilterLoadingBanner() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-siloam-blue/25 bg-siloam-blue/5 px-4 py-3 text-sm font-semibold text-siloam-blue animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-5 w-5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-siloam-blue/30" />
        <span className="relative inline-flex h-5 w-5 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
      </span>
      <span>Memuat data dashboard untuk filter yang dipilih…</span>
    </div>
  );
});

const KPI_ACCENTS = ['#00529B', '#00A3E0', '#007A5E', '#F2C744', '#00529B', '#00529B'];

export const ExecutiveDashboardKpiSkeleton = memo(function ExecutiveDashboardKpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Memuat KPI">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border/60 overflow-hidden min-h-[140px]"
          style={{ borderTopWidth: 4, borderTopColor: KPI_ACCENTS[i] }}
        >
          <div className="p-4 space-y-3">
            <div className={`h-3 w-24 ${pulse}`} />
            <div className={`h-8 w-32 ${pulse}`} />
            <div className={`h-3 w-full max-w-[180px] ${pulse}`} />
          </div>
        </div>
      ))}
    </div>
  );
});

export const ExecutiveDashboardChartSkeleton = memo(function ExecutiveDashboardChartSkeleton({
  title,
}: {
  title?: string;
}) {
  return (
    <div
      className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border/60 p-5 min-h-[360px] flex flex-col"
      aria-busy="true"
      aria-label={title ? `Memuat ${title}` : 'Memuat grafik'}
    >
      <div className={`h-4 w-44 mb-4 shrink-0 ${pulse}`} />
      <div className={`flex-1 min-h-[240px] ${pulse}`} />
    </div>
  );
});

export const ExecutiveDashboardChartsRowSkeleton = memo(function ExecutiveDashboardChartsRowSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
      <ExecutiveDashboardChartSkeleton title="trend" />
      <ExecutiveDashboardChartSkeleton title="unit budget" />
      <ExecutiveDashboardChartSkeleton title="capex status" />
    </div>
  );
});

export const ExecutiveDashboardAnalysisSkeleton = memo(function ExecutiveDashboardAnalysisSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch" aria-busy="true" aria-label="Memuat analisis">
      <ExecutiveDashboardChartSkeleton title="kategori" />
      <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border/60 p-5 min-h-[360px] space-y-3">
        <div className={`h-4 w-48 ${pulse}`} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-10 ${pulse}`} />
        ))}
      </div>
      <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border/60 p-5 min-h-[360px] space-y-3">
        <div className={`h-4 w-40 ${pulse}`} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-10 ${pulse}`} />
        ))}
      </div>
    </div>
  );
});

export const ExecutiveDashboardAlertsSkeleton = memo(function ExecutiveDashboardAlertsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat alert">
      <div className={`h-4 w-32 ${pulse}`} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-24 rounded-xl border border-siloam-border/60 ${pulse}`} />
        ))}
      </div>
    </div>
  );
});
