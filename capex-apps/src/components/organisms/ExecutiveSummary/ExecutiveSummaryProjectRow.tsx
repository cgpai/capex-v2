import React from 'react';

interface ExecutiveSummaryProjectRowProps {
  code: string;
  name: string;
  status: string;
  statusColor?: string;
}

export const ExecutiveSummaryProjectRow: React.FC<ExecutiveSummaryProjectRowProps> = ({
  code,
  name,
  status,
  statusColor,
}) => (
  <div className="flex items-center justify-between py-2 border-b border-siloam-border/50 last:border-0 hover:bg-siloam-bg px-2 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[11px] font-bold text-siloam-text-primary bg-siloam-bg px-1.5 py-0.5 rounded w-10 text-center shrink-0">{code}</span>
      <span className="text-xs text-siloam-text-primary font-medium line-clamp-1">{name}</span>
    </div>
    <span className={`text-[11px] font-bold whitespace-nowrap ml-2 ${statusColor || 'text-siloam-blue'}`}>{status}</span>
  </div>
);
