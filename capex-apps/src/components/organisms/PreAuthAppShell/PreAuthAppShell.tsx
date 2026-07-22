import React from 'react';

/**
 * Shell persisten saat bootstrap belum siar & belum ada sesi cache —
 * bukan layar putih penuh; hanya area konten yang ringan "pulse".
 */
export const PreAuthAppShell: React.FC = () => (
  <div className="flex h-screen bg-siloam-bg text-siloam-text-primary font-inter" aria-busy="true" aria-label="Memuat">
    <aside className="hidden md:flex w-64 flex-col bg-[#4f39f6] shrink-0 p-4 border-r border-[#3e2dd0]">
      <div className="rounded-xl bg-white/95 p-4 min-h-[4rem] flex items-center justify-center">
        <span className="text-xl font-bold text-[#4f39f6] tracking-tight">Capex Pro</span>
      </div>
    </aside>
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="h-14 shrink-0 border-b border-siloam-border bg-siloam-surface" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-3 animate-pulse" aria-hidden>
          <div className="h-10 w-2/3 max-w-xs rounded-lg bg-siloam-border/50" />
          <div className="h-40 rounded-xl bg-siloam-border/30" />
          <div className="h-24 rounded-xl bg-siloam-border/20" />
        </div>
      </main>
    </div>
  </div>
);

PreAuthAppShell.displayName = 'PreAuthAppShell';
