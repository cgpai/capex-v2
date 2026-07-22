import React from 'react';

/** Kerangka UI ringan saat sesi/cache belum siap — hindari layar putih penuh. */
export const AppShellSkeleton: React.FC = () => (
  <div className="h-screen flex bg-siloam-bg animate-pulse" aria-busy="true" aria-label="Memuat aplikasi">
    <div className="hidden md:block w-64 bg-[#4f39f6]/30 shrink-0" />
    <div className="flex-1 flex flex-col min-w-0">
      <div className="h-14 border-b border-siloam-border bg-siloam-surface/80" />
      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 rounded-lg bg-siloam-border/60" />
        <div className="h-32 rounded-xl bg-siloam-border/40" />
        <div className="h-64 rounded-xl bg-siloam-border/30" />
      </div>
    </div>
  </div>
);

AppShellSkeleton.displayName = 'AppShellSkeleton';
