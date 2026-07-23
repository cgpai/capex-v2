import React, { memo } from 'react';

interface ExecutiveDashboardPanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  minHeightClass?: string;
}

export const ExecutiveDashboardPanel = memo(function ExecutiveDashboardPanel({
  title,
  children,
  className = '',
  minHeightClass = 'min-h-[360px]',
}: ExecutiveDashboardPanelProps) {
  return (
    <div
      className={`bg-siloam-surface p-5 rounded-xl shadow-soft border border-siloam-border/60 h-full flex flex-col ${minHeightClass} ${className}`}
    >
      {title ? (
        <h3 className="text-base font-bold text-siloam-text-primary mb-4 shrink-0">{title}</h3>
      ) : null}
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
});
