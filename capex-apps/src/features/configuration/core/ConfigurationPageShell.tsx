import React from 'react';

export const ConfigurationTabLoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div
    className="bg-siloam-surface p-8 rounded-xl shadow-soft text-center space-y-4"
    role="alert"
  >
    <p className="text-siloam-text-primary font-medium">Gagal memuat data tab ini</p>
    <p className="text-sm text-siloam-text-secondary">
      Periksa koneksi jaringan atau coba muat ulang data tab.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="bg-siloam-blue text-white px-5 py-2 rounded-xl hover:bg-siloam-blue/90 transition text-sm font-medium"
    >
      Coba lagi
    </button>
  </div>
);

export const ConfigurationTabSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="space-y-4 animate-pulse" aria-hidden="true">
    <div className="h-10 bg-siloam-border/40 rounded-xl max-w-md" />
    <div className="bg-siloam-surface p-6 rounded-xl shadow-soft space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-siloam-border/30 rounded-lg" />
      ))}
    </div>
  </div>
);

export const ConfigurationPageShell: React.FC<{
  activeTab: string;
  children: React.ReactNode;
  onTabChange: (tab: string) => void;
  onTabHover?: (tab: string) => void;
  tabs: readonly string[];
  isRevalidating?: boolean;
}> = ({ activeTab, children, onTabChange, onTabHover, tabs, isRevalidating }) => (
  <div className={`space-y-6 ${isRevalidating ? 'opacity-[0.98]' : ''}`}>
    {isRevalidating ? (
      <div
        className="h-0.5 w-full bg-siloam-blue/30 animate-pulse rounded-full"
        role="status"
        aria-label="Memperbarui data konfigurasi"
      />
    ) : null}
    <div className="sticky top-0 z-20 bg-siloam-bg border-b border-siloam-border -mx-4 px-4 -mt-4 pt-4 md:-mx-6 md:px-6 md:-mt-6 md:pt-6 lg:-mx-8 lg:px-8 lg:-mt-8 lg:pt-8 transition-all duration-200 shadow-sm bg-opacity-95 backdrop-blur-sm">
      <nav className="-mb-px flex space-x-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onMouseEnter={() => onTabHover?.(tab)}
            onFocus={() => onTabHover?.(tab)}
            onClick={() => onTabChange(tab)}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === tab
                ? 'border-siloam-blue text-siloam-blue'
                : 'border-transparent text-siloam-text-secondary hover:text-siloam-text-primary hover:border-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
    <div className="animate-fade-in">{children}</div>
  </div>
);
